module.exports = function registerConfigAppHandlers(ctx, safeHandle) {

    safeHandle('getConfigApp', async () => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT cle, valeur FROM config_app', (err, rows) => {
                if (err) reject(err);
                else {
                    const config = {};
                    (rows || []).forEach(r => { config[r.cle] = r.valeur; });
                    resolve(config);
                }
            });
        });
    });

    safeHandle('updateConfigApp', async (event, cle, valeur) => {
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'INSERT OR REPLACE INTO config_app (cle, valeur) VALUES (?, ?)',
                [cle, String(valeur)],
                function(err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    safeHandle('getHistoriqueTaux', async (event, salarieId) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
                'SELECT * FROM historique_taux WHERE salarie_id = ? ORDER BY date_effet DESC',
                [salarieId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    });

};
