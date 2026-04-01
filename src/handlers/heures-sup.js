module.exports = function registerHeuresSupHandlers(ctx, safeHandle) {

    safeHandle('ajouter-recup', async (event, data) => {
        const { salarie_id, annee, heures, date, commentaire } = data;
        await ctx.db.execute({
            sql: `INSERT INTO heures_supplementaires (salarie_id, date, heures, commentaire) VALUES (?, ?, ?, ?)`,
            args: [salarie_id, date, heures, commentaire || null]
        });
        await ctx.db.execute({
            sql: `UPDATE soldes SET recup_heures = recup_heures + ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
            args: [heures, salarie_id, annee]
        });
        return { success: true };
    });

    safeHandle('getHeuresSup', async (event, salarie_id) => {
        const result = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE salarie_id = ? ORDER BY date DESC`,
            args: [salarie_id]
        });
        return result.rows;
    });

};
