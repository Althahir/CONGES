const bcrypt = require('bcrypt');

module.exports = function registerAuthHandlers(ctx, safeHandle) {

    safeHandle('login', async (event, email, password) => {
        return new Promise((resolve, reject) => {
            console.log('Tentative de connexion avec email:', email);
            ctx.db.get('SELECT * FROM salaries WHERE LOWER(email) = LOWER(?) AND actif = 1', [email], async (err, user) => {
                if (err) {
                    console.error('Erreur DB:', err);
                    reject(err);
                    return;
                }

                console.log('Utilisateur trouvé:', user);

                if (!user) {
                    console.log('Aucun utilisateur trouvé');
                    resolve({ success: false, message: 'Email ou mot de passe incorrect' });
                    return;
                }

                // Si première connexion (pas de mot de passe)
                if (!user.mot_de_passe) {
                    resolve({
                        success: true,
                        firstLogin: true,
                        user: {
                            id: user.id,
                            nom: user.nom,
                            prenom: user.prenom,
                            email: user.email,
                            role: user.role
                        }
                    });
                    return;
                }

                // Vérifier le mot de passe
                const match = await bcrypt.compare(password, user.mot_de_passe);

                if (match) {
                    resolve({
                        success: true,
                        firstLogin: false,
                        user: {
                            id: user.id,
                            nom: user.nom,
                            prenom: user.prenom,
                            email: user.email,
                            role: user.role
                        }
                    });
                } else {
                    resolve({ success: false, message: 'Email ou mot de passe incorrect' });
                }
            });
        });
    });

    safeHandle('checkFirstLogin', async (event, userId) => {
        return new Promise((resolve, reject) => {
            ctx.db.get('SELECT premiere_connexion FROM salaries WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    });

    safeHandle('setPassword', async (event, userId, password) => {
        return new Promise(async (resolve, reject) => {
            try {
                const hash = await bcrypt.hash(password, 10);
                ctx.db.run(
                    'UPDATE salaries SET mot_de_passe = ?, premiere_connexion = 0 WHERE id = ?',
                    [hash, userId],
                    (err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    }
                );
            } catch (err) {
                reject(err);
            }
        });
    });

    safeHandle('resetPassword', async (event, salarieId) => {
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'UPDATE salaries SET mot_de_passe = NULL, premiere_connexion = 1 WHERE id = ?',
                [salarieId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

};
