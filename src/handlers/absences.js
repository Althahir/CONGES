module.exports = function registerAbsencesHandlers(ctx, safeHandle) {

    safeHandle('getAbsences', async (event, salarieId) => {
        const result = await ctx.db.execute({
            sql: "SELECT * FROM absences WHERE salarie_id = ? AND statut = 'valide' ORDER BY date_debut DESC",
            args: [salarieId]
        });
        return result.rows;
    });

    safeHandle('getAllAbsences', async (event) => {
        const result = await ctx.db.execute({
            sql: "SELECT a.*, s.nom, s.prenom FROM absences a JOIN salaries s ON a.salarie_id = s.id WHERE a.statut = 'valide' ORDER BY a.date_debut DESC",
            args: []
        });
        return result.rows;
    });

    safeHandle('createAbsence', async (event, absenceData) => {
        const { salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire, debut_periode, fin_periode, skipNotification } = absenceData;

        const insertResult = await ctx.db.execute({
            sql: `INSERT INTO absences (salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, statut, commentaire, debut_periode, fin_periode)
                 VALUES (?, ?, ?, ?, ?, ?, 'valide', ?, ?, ?)`,
            args: [salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire, debut_periode || 'journee-complete', fin_periode || 'journee-complete']
        });
        const absenceId = Number(insertResult.lastInsertRowid);
        console.log('Absence créée avec ID:', absenceId);

        if (!skipNotification) {
            try {
                const salarieResult = await ctx.db.execute({
                    sql: 'SELECT nom, prenom FROM salaries WHERE id = ?',
                    args: [salarie_id]
                });
                const salarie = salarieResult.rows[0];

                if (salarie) {
                    const anneeAbsence = new Date(date_debut).getFullYear();
                    const soldesResult = await ctx.db.execute({
                        sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                        args: [salarie_id, anneeAbsence]
                    });
                    const soldes = soldesResult.rows[0];

                    const formatDate = (d) => { const [y, m, j] = d.split('-'); return `${j}/${m}`; };
                    const labels = { CP_N: 'CP', CP_N1: 'CP', CP: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };
                    const typeLabel = labels[type] || type;
                    const dureeStr = (type === 'RECUP' && !duree_jours) ? `${duree_heures}h` : `${duree_jours}j`;

                    let soldeStr = '';
                    if (soldes && type !== 'MALADIE') {
                        if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                            const restant = (soldes.cp_n1 + soldes.cp_n) - (duree_jours || 0);
                            soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}j`;
                        } else if (type === 'RTT') {
                            const restant = soldes.rtt - (duree_jours || 0);
                            soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}j`;
                        } else if (type === 'RECUP') {
                            const restant = soldes.recup_heures - (duree_heures || 0);
                            soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}h`;
                        }
                    }

                    const titre = `Absence posée — ${salarie.prenom} ${salarie.nom}`;
                    const message = `${typeLabel} · du ${formatDate(date_debut)} au ${formatDate(date_fin)} (${dureeStr})${soldeStr}`;
                    await ctx.db.execute({
                        sql: `INSERT INTO notifications (type, titre, message, statut) VALUES ('absence', ?, ?, 'success')`,
                        args: [titre, message]
                    });
                    console.log('Notification absence créée');
                }
            } catch (errNotif) {
                console.error('Erreur création notification absence:', errNotif);
            }
        }

        return { success: true, id: absenceId };
    });

    safeHandle('deleteAbsence', async (event, absenceId) => {
        const absResult = await ctx.db.execute({
            sql: 'SELECT * FROM absences WHERE id = ?',
            args: [absenceId]
        });
        const absence = absResult.rows[0];

        if (!absence) throw new Error('Absence introuvable');

        const salarieId = absence.salarie_id;
        const type = absence.type;
        const dureeJours = absence.duree_jours || 0;
        const dureeHeures = absence.duree_heures || 0;
        const anneeEnCours = new Date().getFullYear();

        await ctx.db.execute({
            sql: 'DELETE FROM absences WHERE id = ?',
            args: [absenceId]
        });

        if (type !== 'MALADIE') {
            const soldesResult = await ctx.db.execute({
                sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                args: [salarieId, anneeEnCours]
            });
            const soldes = soldesResult.rows[0];

            if (!soldes) throw new Error('Soldes introuvables pour l\'année en cours');

            let nouveauCPN1 = soldes.cp_n1;
            let nouveauCPN = soldes.cp_n;
            let nouveauRTT = soldes.rtt;
            let nouvelleRecup = soldes.recup_heures;

            if (type === 'CP_N1') {
                nouveauCPN1 = soldes.cp_n1 + dureeJours;
            } else if (type === 'CP_N' || type === 'CP') {
                nouveauCPN = soldes.cp_n + dureeJours;
            } else if (type === 'RTT') {
                nouveauRTT = soldes.rtt + dureeJours;
            } else if (type === 'RECUP') {
                nouvelleRecup = soldes.recup_heures + dureeHeures;
            }

            await ctx.db.execute({
                sql: `UPDATE soldes SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
                args: [nouveauCPN1, nouveauCPN, nouveauRTT, nouvelleRecup, salarieId, anneeEnCours]
            });
        }

        return { success: true, absence, message: 'Absence supprimée et soldes recalculés' };
    });

    safeHandle('updateAbsence', async (event, absenceId, updates) => {
        const fields = [];
        const values = [];

        if (updates.date_debut !== undefined) { fields.push('date_debut = ?'); values.push(updates.date_debut); }
        if (updates.date_fin !== undefined) { fields.push('date_fin = ?'); values.push(updates.date_fin); }
        if (updates.duree_jours !== undefined) { fields.push('duree_jours = ?'); values.push(updates.duree_jours); }
        if (updates.duree_heures !== undefined) { fields.push('duree_heures = ?'); values.push(updates.duree_heures); }

        values.push(absenceId);

        await ctx.db.execute({
            sql: `UPDATE absences SET ${fields.join(', ')} WHERE id = ?`,
            args: values
        });
        return { success: true };
    });

};
