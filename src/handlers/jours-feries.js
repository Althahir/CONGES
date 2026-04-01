module.exports = function registerJoursFeriesHandlers(ctx, safeHandle) {

    safeHandle('getJoursFeries', async (event, annee) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM jours_feries WHERE annee = ? ORDER BY date',
            args: [annee]
        });
        return result.rows;
    });

    safeHandle('addJourFerie', async (event, data) => {
        const { date, libelle, annee } = data;
        const result = await ctx.db.execute({
            sql: 'INSERT INTO jours_feries (date, libelle, annee) VALUES (?, ?, ?)',
            args: [date, libelle, annee]
        });
        return { success: true, id: Number(result.lastInsertRowid) };
    });

    safeHandle('deleteJourFerie', async (event, id) => {
        await ctx.db.execute({
            sql: 'DELETE FROM jours_feries WHERE id = ?',
            args: [id]
        });
        return { success: true };
    });

};
