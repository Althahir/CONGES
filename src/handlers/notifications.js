module.exports = function registerNotificationsHandlers(ctx, safeHandle) {

    safeHandle('getNotificationsNonLues', async (event, userId) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
                `SELECT * FROM notifications
                 WHERE lue = 0 AND (user_id IS NULL OR user_id = ?)
                 ORDER BY date_creation DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    });

    safeHandle('marquerNotificationLue', async (event, notificationId) => {
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'UPDATE notifications SET lue = 1 WHERE id = ?',
                [notificationId],
                (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    safeHandle('creerNotification', async (event, notificationData) => {
        return new Promise((resolve, reject) => {
            const { type, titre, message, details, statut } = notificationData;

            ctx.db.run(
                `INSERT INTO notifications (type, titre, message, details, statut, user_id)
                 VALUES (?, ?, ?, ?, ?, NULL)`,
                [type, titre, message, details, statut],
                function(err) {
                    if (err) reject(err);
                    else {
                        const notif = { id: this.lastID, type, titre, message, details, statut };
                        if (ctx.mainWindow && ctx.mainWindow.webContents) {
                            ctx.mainWindow.webContents.send('traitement-automatique', notif);
                        }
                        resolve({ success: true, id: this.lastID });
                    }
                }
            );
        });
    });

};
