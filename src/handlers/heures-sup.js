module.exports = function registerHeuresSupHandlers(ctx, safeHandle) {

    safeHandle('ajouter-recup', async (event, data) => {
        const { salarie_id, annee, heures, date, commentaire } = data;
        return new Promise((resolve, reject) => {
            ctx.db.run(
                `INSERT INTO heures_supplementaires (salarie_id, date, heures, commentaire) VALUES (?, ?, ?, ?)`,
                [salarie_id, date, heures, commentaire || null],
                (err) => {
                    if (err) {
                        console.error('Erreur insertion heures sup:', err);
                        reject(err);
                        return;
                    }
                    ctx.db.run(
                        `UPDATE soldes SET recup_heures = recup_heures + ?, derniere_maj = CURRENT_TIMESTAMP
                         WHERE salarie_id = ? AND annee = ?`,
                        [heures, salarie_id, annee],
                        (err2) => {
                            if (err2) {
                                console.error('Erreur maj solde recup:', err2);
                                reject(err2);
                            } else {
                                resolve({ success: true });
                            }
                        }
                    );
                }
            );
        });
    });

    safeHandle('getHeuresSup', async (event, salarie_id) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
                `SELECT * FROM heures_supplementaires WHERE salarie_id = ? ORDER BY date DESC`,
                [salarie_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    });

};
