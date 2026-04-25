// Handler d'administration DB — utilisé par l'easter egg Ctrl+DEBUG (DB browser)
// Permet de lister / éditer / exécuter du SQL libre sur toutes les tables.
// À manipuler avec précaution : aucune sécurité applicative, on fait confiance à l'admin.

module.exports = function registerDbAdminHandlers(ctx, safeHandle) {

    safeHandle('db-list-tables', async () => {
        const result = await ctx.db.execute(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        const tables = [];
        for (const row of result.rows) {
            const name = row.name;
            try {
                const c = await ctx.db.execute(`SELECT COUNT(*) AS cnt FROM "${name}"`);
                tables.push({ name, rowCount: Number(c.rows[0].cnt) });
            } catch (e) {
                tables.push({ name, rowCount: -1 });
            }
        }
        return tables;
    });

    safeHandle('db-get-table', async (event, name, limit = 500, offset = 0) => {
        const pragma = await ctx.db.execute(`PRAGMA table_info("${name}")`);
        const columns = pragma.rows.map(r => ({
            name: r.name,
            type: r.type,
            notnull: Number(r.notnull),
            pk: Number(r.pk),
            dflt_value: r.dflt_value
        }));
        const primaryKey = (columns.find(c => c.pk === 1) || {}).name || null;

        const c = await ctx.db.execute(`SELECT COUNT(*) AS cnt FROM "${name}"`);
        const totalCount = Number(c.rows[0].cnt);

        const orderBy = primaryKey ? `ORDER BY "${primaryKey}" ASC` : '';
        const rowsResult = await ctx.db.execute({
            sql: `SELECT * FROM "${name}" ${orderBy} LIMIT ? OFFSET ?`,
            args: [limit, offset]
        });

        return { columns, primaryKey, totalCount, rows: rowsResult.rows };
    });

    safeHandle('db-update-cell', async (event, table, pkName, pkValue, column, newValue) => {
        if (!pkName) throw new Error('Table sans clé primaire — édition impossible');
        const value = newValue === '' ? null : newValue;
        await ctx.db.execute({
            sql: `UPDATE "${table}" SET "${column}" = ? WHERE "${pkName}" = ?`,
            args: [value, pkValue]
        });
        return { success: true };
    });

    safeHandle('db-delete-row', async (event, table, pkName, pkValue) => {
        if (!pkName) throw new Error('Table sans clé primaire — suppression impossible');
        const result = await ctx.db.execute({
            sql: `DELETE FROM "${table}" WHERE "${pkName}" = ?`,
            args: [pkValue]
        });
        return { success: true, rowsAffected: Number(result.rowsAffected || 0) };
    });

    safeHandle('db-insert-row', async (event, table, values) => {
        const cols = Object.keys(values).filter(k => values[k] !== undefined);
        if (cols.length === 0) throw new Error('Aucune valeur à insérer');
        const colsSql = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const args = cols.map(c => values[c] === '' ? null : values[c]);
        const result = await ctx.db.execute({
            sql: `INSERT INTO "${table}" (${colsSql}) VALUES (${placeholders})`,
            args
        });
        return { success: true, id: Number(result.lastInsertRowid || 0) };
    });

    safeHandle('db-exec-raw', async (event, sql) => {
        const result = await ctx.db.execute(sql);
        return {
            success: true,
            rows: result.rows || [],
            columns: (result.columns || []),
            rowsAffected: Number(result.rowsAffected || 0)
        };
    });

};
