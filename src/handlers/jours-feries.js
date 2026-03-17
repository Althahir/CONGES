module.exports = function registerJoursFeriesHandlers(ctx, safeHandle) {

    safeHandle('getJoursFeries', async (event, annee) => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM jours_feries WHERE annee = ? ORDER BY date', [annee], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    safeHandle('addJourFerie', async (event, data) => {
        return new Promise((resolve, reject) => {
            const { date, libelle, annee } = data;
            ctx.db.run(
                'INSERT INTO jours_feries (date, libelle, annee) VALUES (?, ?, ?)',
                [date, libelle, annee],
                function(err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                }
            );
        });
    });

    safeHandle('deleteJourFerie', async (event, id) => {
        return new Promise((resolve, reject) => {
            ctx.db.run('DELETE FROM jours_feries WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

};
