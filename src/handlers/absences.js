module.exports = function registerAbsencesHandlers(ctx, safeHandle) {

    // Débit des soldes pour une absence validée (logique partagée avec updateSoldesAfterAbsence)
    async function debiterSoldes(salarieId, annee, type, dureeJours, dureeHeures, absenceId) {
        if (type === 'MALADIE') return;

        const soldesResult = await ctx.db.execute({
            sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            args: [salarieId, annee]
        });
        const soldes = soldesResult.rows[0];
        if (!soldes) throw new Error('Soldes introuvables');

        let cp_n1 = soldes.cp_n1;
        let cp_n = soldes.cp_n;
        let rtt = soldes.rtt;
        let recup_heures = soldes.recup_heures;
        let debiteN1 = 0;
        let debiteN = 0;

        if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
            let reste = dureeJours || 0;
            if (cp_n1 > 0) {
                const deduc = Math.min(cp_n1, reste);
                cp_n1 -= deduc;
                reste -= deduc;
                debiteN1 = deduc;
            }
            if (reste > 0) {
                cp_n -= reste;
                debiteN = reste;
            }
        } else if (type === 'RTT') {
            rtt -= (dureeJours || 0);
        } else if (type === 'RECUP') {
            if (dureeHeures && dureeHeures > 0) recup_heures -= dureeHeures;
            else if (dureeJours && dureeJours > 0) recup_heures -= dureeJours * 7;
        }

        await ctx.db.execute({
            sql: `UPDATE soldes SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
            args: [cp_n1, cp_n, rtt, recup_heures, salarieId, annee]
        });

        if (absenceId && (type === 'CP' || type === 'CP_N' || type === 'CP_N1')) {
            await ctx.db.execute({
                sql: 'UPDATE absences SET debite_cp_n1 = ?, debite_cp_n = ? WHERE id = ?',
                args: [debiteN1, debiteN, absenceId]
            });
        }
    }

    function formatDate(d) {
        const [y, m, j] = d.split('-');
        return `${j}/${m}`;
    }

    const LABELS_TYPE = { CP_N: 'CP', CP_N1: 'CP', CP: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };

    // Affiche les absences validées ET en attente (pas les refusées)
    safeHandle('getAbsences', async (event, salarieId) => {
        const result = await ctx.db.execute({
            sql: "SELECT * FROM absences WHERE salarie_id = ? AND statut IN ('valide', 'en_attente') ORDER BY date_debut DESC",
            args: [salarieId]
        });
        return result.rows;
    });

    safeHandle('getAllAbsences', async (event) => {
        const result = await ctx.db.execute({
            sql: "SELECT a.*, s.nom, s.prenom FROM absences a JOIN salaries s ON a.salarie_id = s.id WHERE a.statut IN ('valide', 'en_attente') ORDER BY a.date_debut DESC",
            args: []
        });
        return result.rows;
    });

    // Liste des demandes en attente (admin) — avec infos salarié
    safeHandle('getAbsencesEnAttente', async (event) => {
        const result = await ctx.db.execute({
            sql: "SELECT a.*, s.nom, s.prenom FROM absences a JOIN salaries s ON a.salarie_id = s.id WHERE a.statut = 'en_attente' ORDER BY a.date_creation DESC",
            args: []
        });
        return result.rows;
    });

    // Montants engagés en attente par salarié / année (pour le solde prévisionnel)
    safeHandle('getEnAttenteParSalarie', async (event, salarieId, annee) => {
        const anneeDebut = `${annee}-01-01`;
        const anneeFin = `${annee}-12-31`;
        // duree_heures est désormais autoritatif pour les RECUP (3h matin / 4h après-midi / 7h jour).
        // Fallback duree_jours×7 pour les saisies legacy où duree_heures n'était pas rempli.
        const result = await ctx.db.execute({
            sql: `SELECT type,
                         SUM(duree_jours) AS jours,
                         SUM(COALESCE(NULLIF(duree_heures, 0), duree_jours * 7, 0)) AS heures
                  FROM absences
                  WHERE salarie_id = ? AND statut = 'en_attente'
                    AND date_debut <= ? AND date_fin >= ?
                  GROUP BY type`,
            args: [salarieId, anneeFin, anneeDebut]
        });

        const engagement = { cp: 0, rtt: 0, recup_heures: 0 };
        for (const row of result.rows) {
            if (row.type === 'CP' || row.type === 'CP_N' || row.type === 'CP_N1') {
                engagement.cp += row.jours || 0;
            } else if (row.type === 'RTT') {
                engagement.rtt += row.jours || 0;
            } else if (row.type === 'RECUP') {
                engagement.recup_heures += row.heures || 0;
            }
        }

        // Ajouter les retraits d'heures de récup en attente (table heures_supplementaires)
        // Les crédits (heures > 0) sont validés immédiatement donc pas concernés.
        const hsupRes = await ctx.db.execute({
            sql: `SELECT SUM(ABS(heures)) AS heures FROM heures_supplementaires
                  WHERE salarie_id = ? AND statut = 'en_attente' AND heures < 0
                    AND date BETWEEN ? AND ?`,
            args: [salarieId, anneeDebut, anneeFin]
        });
        if (hsupRes.rows[0] && hsupRes.rows[0].heures) {
            engagement.recup_heures += Number(hsupRes.rows[0].heures);
        }

        return engagement;
    });

    safeHandle('createAbsence', async (event, absenceData) => {
        const { salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire, debut_periode, fin_periode, skipNotification, autoValide } = absenceData;

        const statut = autoValide ? 'valide' : 'en_attente';
        const dateValidation = autoValide ? new Date().toISOString() : null;

        const insertResult = await ctx.db.execute({
            sql: `INSERT INTO absences (salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, statut, commentaire, debut_periode, fin_periode, date_validation)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, statut, commentaire, debut_periode || 'journee-complete', fin_periode || 'journee-complete', dateValidation]
        });
        const absenceId = Number(insertResult.lastInsertRowid);
        console.log(`Absence créée ID:${absenceId} statut:${statut}`);

        if (skipNotification) return { success: true, id: absenceId, statut };

        try {
            const salarieResult = await ctx.db.execute({
                sql: 'SELECT nom, prenom FROM salaries WHERE id = ?',
                args: [salarie_id]
            });
            const salarie = salarieResult.rows[0];
            if (!salarie) return { success: true, id: absenceId, statut };

            const typeLabel = LABELS_TYPE[type] || type;
            const dureeStr = (type === 'RECUP' && !duree_jours) ? `${duree_heures}h` : `${duree_jours}j`;
            const periode = `du ${formatDate(date_debut)} au ${formatDate(date_fin)}`;

            if (statut === 'en_attente') {
                // Pas de notif DB pour les demandes en attente — le badge nav + bandeau Historique
                // servent déjà de signal à l'admin, évite le doublon dans le dropdown cloche.
            } else {
                // Notif globale admins : absence posée directement (admin ou auto-validée)
                const anneeAbsence = new Date(date_debut).getFullYear();
                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie_id, anneeAbsence]
                });
                const soldes = soldesResult.rows[0];
                let soldeStr = '';
                if (soldes && type !== 'MALADIE') {
                    if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                        const restant = (soldes.cp_n1 + soldes.cp_n) - (duree_jours || 0);
                        soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(2)}j`;
                    } else if (type === 'RTT') {
                        const restant = soldes.rtt - (duree_jours || 0);
                        soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(2)}j`;
                    } else if (type === 'RECUP') {
                        const restant = soldes.recup_heures - (duree_heures || 0);
                        soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(2)}h`;
                    }
                }
                const titre = `Absence posée — ${salarie.prenom} ${salarie.nom}`;
                const message = `${typeLabel} · ${periode} (${dureeStr})${soldeStr}`;
                await ctx.db.execute({
                    sql: `INSERT INTO notifications (type, titre, message, statut) VALUES ('absence', ?, ?, 'success')`,
                    args: [titre, message]
                });
            }
        } catch (errNotif) {
            console.error('Erreur création notification absence:', errNotif);
        }

        return { success: true, id: absenceId, statut };
    });

    safeHandle('validerAbsence', async (event, absenceId, adminId) => {
        // UPDATE conditionnel : on ne valide que si la demande est encore en_attente.
        // Si quelqu'un d'autre l'a déjà traitée (ou si le user l'a supprimée entre-temps),
        // rowsAffected = 0 et on abort sans débiter le solde (pas de race condition).
        const upd = await ctx.db.execute({
            sql: `UPDATE absences SET statut = 'valide', date_validation = CURRENT_TIMESTAMP, validee_par = ? WHERE id = ? AND statut = 'en_attente'`,
            args: [adminId, absenceId]
        });
        if (Number(upd.rowsAffected) === 0) {
            throw new Error('Demande introuvable ou déjà traitée (probablement retirée par le salarié).');
        }

        // Maintenant la ligne est en 'valide'. On la relit pour avoir les infos pour le débit + notif.
        const absResult = await ctx.db.execute({
            sql: 'SELECT * FROM absences WHERE id = ?',
            args: [absenceId]
        });
        const absence = absResult.rows[0];
        if (!absence) throw new Error('Absence introuvable après validation');

        const annee = new Date(absence.date_debut).getFullYear();
        await debiterSoldes(absence.salarie_id, annee, absence.type, absence.duree_jours, absence.duree_heures, absenceId);

        // Notif ciblée salarié
        try {
            const typeLabel = LABELS_TYPE[absence.type] || absence.type;
            const periode = `du ${formatDate(absence.date_debut)} au ${formatDate(absence.date_fin)}`;
            const titre = `Demande validée ✓`;
            const message = `Votre demande ${typeLabel} ${periode} a été validée.`;
            const insRes = await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id) VALUES ('demande_validee', ?, ?, 'success', ?)`,
                args: [titre, message, absence.salarie_id]
            });
            const notifId = Number(insRes.lastInsertRowid);
            if (ctx.mainWindow && ctx.mainWindow.webContents) {
                ctx.mainWindow.webContents.send('traitement-automatique', { id: notifId, type: 'demande_validee', titre, message, statut: 'success', user_id: absence.salarie_id });
            }
        } catch (errNotif) {
            console.error('Erreur notification validerAbsence:', errNotif);
        }

        return { success: true };
    });

    safeHandle('refuserAbsence', async (event, absenceId, adminId) => {
        // UPDATE conditionnel — abort si déjà traitée ou supprimée
        const upd = await ctx.db.execute({
            sql: `UPDATE absences SET statut = 'refuse', date_validation = CURRENT_TIMESTAMP, validee_par = ? WHERE id = ? AND statut = 'en_attente'`,
            args: [adminId, absenceId]
        });
        if (Number(upd.rowsAffected) === 0) {
            throw new Error('Demande introuvable ou déjà traitée (probablement retirée par le salarié).');
        }

        const absResult = await ctx.db.execute({
            sql: 'SELECT * FROM absences WHERE id = ?',
            args: [absenceId]
        });
        const absence = absResult.rows[0];
        if (!absence) throw new Error('Absence introuvable après refus');

        try {
            const typeLabel = LABELS_TYPE[absence.type] || absence.type;
            const periode = `du ${formatDate(absence.date_debut)} au ${formatDate(absence.date_fin)}`;
            const titre = `Demande refusée ✕`;
            const message = `Votre demande ${typeLabel} ${periode} a été refusée.`;
            const insRes = await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id) VALUES ('demande_refusee', ?, ?, 'error', ?)`,
                args: [titre, message, absence.salarie_id]
            });
            const notifId = Number(insRes.lastInsertRowid);
            if (ctx.mainWindow && ctx.mainWindow.webContents) {
                ctx.mainWindow.webContents.send('traitement-automatique', { id: notifId, type: 'demande_refusee', titre, message, statut: 'error', user_id: absence.salarie_id });
            }
        } catch (errNotif) {
            console.error('Erreur notification refuserAbsence:', errNotif);
        }

        return { success: true };
    });

    safeHandle('deleteAbsence', async (event, absenceId) => {
        // DELETE atomique avec RETURNING : on récupère la ligne avec son statut au
        // moment exact de la suppression. Cela évite la race condition entre un
        // SELECT initial et le DELETE (admin pourrait valider entre les deux).
        const delResult = await ctx.db.execute({
            sql: 'DELETE FROM absences WHERE id = ? RETURNING *',
            args: [absenceId]
        });
        const absence = delResult.rows[0];

        if (!absence) throw new Error('Absence introuvable');

        const salarieId = absence.salarie_id;
        const type = absence.type;
        const statut = absence.statut;
        const dureeJours = absence.duree_jours || 0;
        const dureeHeures = absence.duree_heures || 0;
        const annee = new Date(absence.date_debut).getFullYear();

        // Rollback solde UNIQUEMENT si l'absence était validée (en_attente et refuse n'ont jamais débité)
        if (statut === 'valide' && type !== 'MALADIE') {
            const soldesResult = await ctx.db.execute({
                sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                args: [salarieId, annee]
            });
            const soldes = soldesResult.rows[0];

            if (!soldes) throw new Error(`Soldes introuvables pour l'année ${annee}`);

            let nouveauCPN1 = soldes.cp_n1;
            let nouveauCPN = soldes.cp_n;
            let nouveauRTT = soldes.rtt;
            let nouvelleRecup = soldes.recup_heures;

            if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                // Nouveau : si on a la décomposition, on recrédite chaque compte exactement
                const debiteN1 = absence.debite_cp_n1 || 0;
                const debiteN = absence.debite_cp_n || 0;
                if (debiteN1 > 0 || debiteN > 0) {
                    nouveauCPN1 = soldes.cp_n1 + debiteN1;
                    nouveauCPN = soldes.cp_n + debiteN;
                } else {
                    // Fallback (anciennes absences pré-v6) : ancien comportement
                    if (type === 'CP_N1') nouveauCPN1 = soldes.cp_n1 + dureeJours;
                    else nouveauCPN = soldes.cp_n + dureeJours;
                }
            } else if (type === 'RTT') {
                nouveauRTT = soldes.rtt + dureeJours;
            } else if (type === 'RECUP') {
                nouvelleRecup = soldes.recup_heures + dureeHeures;
            }

            await ctx.db.execute({
                sql: `UPDATE soldes SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
                args: [nouveauCPN1, nouveauCPN, nouveauRTT, nouvelleRecup, salarieId, annee]
            });
        }

        // Si l'absence était en attente, prévenir les admins pour rafraîchir le bandeau Validation
        if (statut === 'en_attente' && ctx.mainWindow && ctx.mainWindow.webContents) {
            ctx.mainWindow.webContents.send('traitement-automatique', {
                type: 'demande_supprimee',
                titre: 'Demande retirée',
                message: 'Une demande en attente a été retirée par le salarié.',
                statut: 'info'
            });
        }

        return { success: true, absence, message: 'Absence supprimée' };
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
