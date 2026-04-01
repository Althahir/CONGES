module.exports = function registerNotificationsHandlers(ctx, safeHandle) {

    safeHandle('getNotificationsNonLues', async (event, userId) => {
        const result = await ctx.db.execute({
            sql: `SELECT * FROM notifications WHERE lue = 0 AND (user_id IS NULL OR user_id = ?) ORDER BY date_creation DESC`,
            args: [userId]
        });
        return result.rows;
    });

    safeHandle('marquerNotificationLue', async (event, notificationId) => {
        await ctx.db.execute({
            sql: 'UPDATE notifications SET lue = 1 WHERE id = ?',
            args: [notificationId]
        });
        return { success: true };
    });

    safeHandle('creerNotification', async (event, notificationData) => {
        const { type, titre, message, details, statut } = notificationData;
        const result = await ctx.db.execute({
            sql: `INSERT INTO notifications (type, titre, message, details, statut, user_id) VALUES (?, ?, ?, ?, ?, NULL)`,
            args: [type, titre, message, details, statut]
        });
        const id = Number(result.lastInsertRowid);
        const notif = { id, type, titre, message, details, statut };
        if (ctx.mainWindow && ctx.mainWindow.webContents) {
            ctx.mainWindow.webContents.send('traitement-automatique', notif);
        }
        return { success: true, id };
    });

};
