module.exports = function registerRTTHandlers(ctx, safeHandle) {

    safeHandle('getRTTAnnuels', async (event) => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM rtt_annuels ORDER BY annee_debut DESC', (err, rows) => {
                if (err) reject(err);
                else {
                    console.log('getRTTAnnuels:', JSON.stringify(rows));
                    resolve(rows);
                }
            });
        });
    });

    safeHandle('addRTTAnnuel', async (event, data) => {
        return new Promise((resolve, reject) => {
            console.log('addRTTAnnuel reçu:', JSON.stringify(data));
            const { annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt } = data;
            ctx.db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee_debut], (err, row) => {
                if (err) { reject(err); return; }
                if (row) {
                    ctx.db.run(
                        `UPDATE rtt_annuels SET date_debut = ?, date_fin = ?, nb_jours_travailles = ?, nb_cp_a_deduire = ?,
                         nb_jours_periode = ?, nb_jours_we = ?, nb_jours_feries_hors_we = ?, nb_rtt = ? WHERE annee_debut = ?`,
                        [date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt, annee_debut],
                        (err) => {
                            if (err) reject(err);
                            else resolve({ success: true });
                        }
                    );
                } else {
                    ctx.db.run(
                        `INSERT INTO rtt_annuels (annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire,
                         nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ success: true, id: this.lastID });
                        }
                    );
                }
            });
        });
    });

};
