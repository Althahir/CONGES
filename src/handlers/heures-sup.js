module.exports = function registerHeuresSupHandlers(ctx, safeHandle) {

    async function ajusterSoldeRecup(salarieId, annee, delta) {
        const existant = await ctx.db.execute({
            sql: `SELECT id FROM soldes WHERE salarie_id = ? AND annee = ?`,
            args: [salarieId, annee]
        });
        if (existant.rows[0]) {
            await ctx.db.execute({
                sql: `UPDATE soldes SET recup_heures = recup_heures + ?, derniere_maj = CURRENT_TIMESTAMP
                      WHERE salarie_id = ? AND annee = ?`,
                args: [delta, salarieId, annee]
            });
        } else {
            await ctx.db.execute({
                sql: `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, 0, 0, 0, ?)`,
                args: [salarieId, annee, delta]
            });
        }
    }

    function formatDateFr(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR');
    }

    safeHandle('ajouter-recup', async (event, data) => {
        const { salarie_id, annee, heures, date, commentaire, source } = data;
        await ctx.db.execute({
            sql: `INSERT INTO heures_supplementaires (salarie_id, date, heures, commentaire, source) VALUES (?, ?, ?, ?, ?)`,
            args: [salarie_id, date, heures, commentaire || null, source || 'manuel']
        });
        await ajusterSoldeRecup(salarie_id, annee, heures);
        return { success: true };
    });

    safeHandle('getHeuresSup', async (event, salarie_id) => {
        const result = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE salarie_id = ? ORDER BY date DESC`,
            args: [salarie_id]
        });
        return result.rows;
    });

    // Union heures_supplementaires + absences RECUP (lecture seule pour ces dernières)
    safeHandle('getHistoriqueRecupComplet', async (event, salarie_id) => {
        const hsupRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE salarie_id = ?`,
            args: [salarie_id]
        });
        const absRes = await ctx.db.execute({
            sql: `SELECT * FROM absences WHERE salarie_id = ? AND type = 'RECUP' AND statut = 'valide'`,
            args: [salarie_id]
        });

        const hsupRows = hsupRes.rows.map(h => ({
            ...h,
            _origine: 'heures_sup'
        }));

        const absRows = absRes.rows.map(a => {
            const debutFr = new Date(a.date_debut).toLocaleDateString('fr-FR');
            const finFr = new Date(a.date_fin).toLocaleDateString('fr-FR');
            const periodeTxt = a.date_debut === a.date_fin ? debutFr : `${debutFr} → ${finFr}`;
            const dureeTxt = a.duree_jours ? `${Number(a.duree_jours).toFixed(1)} jour(s)` : '';
            const baseComm = `Pose congé · ${periodeTxt}${dureeTxt ? ' · ' + dureeTxt : ''}`;
            const commentaire = a.commentaire ? `${baseComm} · ${a.commentaire}` : baseComm;
            return {
                id: `abs_${a.id}`,
                _absenceId: a.id,
                salarie_id: a.salarie_id,
                date: a.date_debut,
                heures: -Number(a.duree_heures || (a.duree_jours * 7) || 0),
                commentaire,
                date_creation: a.date_creation,
                source: 'pose_conge',
                _origine: 'absence_recup'
            };
        });

        const merged = [...hsupRows, ...absRows];
        merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        return merged;
    });

    safeHandle('updateHeureSup', async (event, payload) => {
        const { id, date, heures, commentaire } = payload;

        const oldRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });
        const old = oldRes.rows[0];
        if (!old) throw new Error('Heure de récupération introuvable');

        const ancienneAnnee = new Date(old.date).getFullYear();
        const nouvelleAnnee = new Date(date).getFullYear();
        const ancienHeures = Number(old.heures);
        const nouvelHeures = Number(heures);

        if (ancienneAnnee === nouvelleAnnee) {
            const delta = nouvelHeures - ancienHeures;
            if (delta !== 0) await ajusterSoldeRecup(old.salarie_id, nouvelleAnnee, delta);
        } else {
            await ajusterSoldeRecup(old.salarie_id, ancienneAnnee, -ancienHeures);
            await ajusterSoldeRecup(old.salarie_id, nouvelleAnnee, nouvelHeures);
        }

        await ctx.db.execute({
            sql: `UPDATE heures_supplementaires SET date = ?, heures = ?, commentaire = ? WHERE id = ?`,
            args: [date, nouvelHeures, commentaire || null, id]
        });

        const details = `Saisie #${id} : ${ancienHeures}h du ${formatDateFr(old.date)} → ${nouvelHeures}h du ${formatDateFr(date)}`;
        await ctx.db.execute({
            sql: `INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut)
                  VALUES ('RECUP_MODIF', ?, 1, ?, 'success')`,
            args: [nouvelleAnnee, details]
        });

        await ctx.db.execute({
            sql: `INSERT INTO notifications (type, titre, message, statut, user_id)
                  VALUES ('recup_modifiee', ?, ?, 'success', ?)`,
            args: [
                'Heures de récupération modifiées',
                `Votre saisie de ${ancienHeures}h du ${formatDateFr(old.date)} a été modifiée en ${nouvelHeures}h du ${formatDateFr(date)}.`,
                old.salarie_id
            ]
        });

        return { success: true };
    });

    safeHandle('deleteHeureSup', async (event, id) => {
        const oldRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });
        const old = oldRes.rows[0];
        if (!old) throw new Error('Heure de récupération introuvable');

        const annee = new Date(old.date).getFullYear();
        const heures = Number(old.heures);

        await ajusterSoldeRecup(old.salarie_id, annee, -heures);

        await ctx.db.execute({
            sql: `DELETE FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });

        const details = `Saisie #${id} : ${heures}h du ${formatDateFr(old.date)}${old.commentaire ? ' (' + old.commentaire + ')' : ''}`;
        await ctx.db.execute({
            sql: `INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut)
                  VALUES ('RECUP_SUPPR', ?, 1, ?, 'success')`,
            args: [annee, details]
        });

        await ctx.db.execute({
            sql: `INSERT INTO notifications (type, titre, message, statut, user_id)
                  VALUES ('recup_supprimee', ?, ?, 'success', ?)`,
            args: [
                'Heures de récupération supprimées',
                `Votre saisie de ${heures}h du ${formatDateFr(old.date)} a été supprimée.`,
                old.salarie_id
            ]
        });

        return { success: true };
    });

};
