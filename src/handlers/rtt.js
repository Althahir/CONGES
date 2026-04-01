module.exports = function registerRTTHandlers(ctx, safeHandle) {

    safeHandle('getRTTAnnuels', async (event) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM rtt_annuels ORDER BY annee_debut DESC',
            args: []
        });
        console.log('getRTTAnnuels:', JSON.stringify(result.rows));
        return result.rows;
    });

    safeHandle('addRTTAnnuel', async (event, data) => {
        console.log('addRTTAnnuel reçu:', JSON.stringify(data));
        const { annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt } = data;

        const existing = await ctx.db.execute({
            sql: 'SELECT id FROM rtt_annuels WHERE annee_debut = ?',
            args: [annee_debut]
        });

        if (existing.rows[0]) {
            await ctx.db.execute({
                sql: `UPDATE rtt_annuels SET date_debut = ?, date_fin = ?, nb_jours_travailles = ?, nb_cp_a_deduire = ?,
                     nb_jours_periode = ?, nb_jours_we = ?, nb_jours_feries_hors_we = ?, nb_rtt = ? WHERE annee_debut = ?`,
                args: [date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt, annee_debut]
            });
            return { success: true };
        } else {
            const result = await ctx.db.execute({
                sql: `INSERT INTO rtt_annuels (annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire,
                     nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt]
            });
            return { success: true, id: Number(result.lastInsertRowid) };
        }
    });

};
