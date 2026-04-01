module.exports = function registerConfigAppHandlers(ctx, safeHandle) {

    safeHandle('getConfigApp', async () => {
        const result = await ctx.db.execute({
            sql: 'SELECT cle, valeur FROM config_app',
            args: []
        });
        const config = {};
        (result.rows || []).forEach(r => { config[r.cle] = r.valeur; });
        return config;
    });

    safeHandle('updateConfigApp', async (event, cle, valeur) => {
        await ctx.db.execute({
            sql: 'INSERT OR REPLACE INTO config_app (cle, valeur) VALUES (?, ?)',
            args: [cle, String(valeur)]
        });
        return { success: true };
    });

    safeHandle('getHistoriqueTaux', async (event, salarieId) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM historique_taux WHERE salarie_id = ? ORDER BY date_effet DESC',
            args: [salarieId]
        });
        return result.rows;
    });

};
