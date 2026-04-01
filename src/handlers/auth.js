const bcrypt = require('bcrypt');

module.exports = function registerAuthHandlers(ctx, safeHandle) {

    safeHandle('login', async (event, email, password) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM salaries WHERE LOWER(email) = LOWER(?) AND actif = 1',
            args: [email]
        });
        const user = result.rows[0];

        console.log('Tentative de connexion avec email:', email);
        console.log('Utilisateur trouvé:', user);

        if (!user) {
            console.log('Aucun utilisateur trouvé');
            return { success: false, message: 'Email ou mot de passe incorrect' };
        }

        // Si première connexion (pas de mot de passe)
        if (!user.mot_de_passe) {
            return {
                success: true,
                firstLogin: true,
                user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
            };
        }

        // Vérifier le mot de passe
        const match = await bcrypt.compare(password, user.mot_de_passe);
        if (match) {
            return {
                success: true,
                firstLogin: false,
                user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
            };
        } else {
            return { success: false, message: 'Email ou mot de passe incorrect' };
        }
    });

    safeHandle('checkFirstLogin', async (event, userId) => {
        const result = await ctx.db.execute({
            sql: 'SELECT premiere_connexion FROM salaries WHERE id = ?',
            args: [userId]
        });
        return result.rows[0];
    });

    safeHandle('setPassword', async (event, userId, password) => {
        const hash = await bcrypt.hash(password, 10);
        await ctx.db.execute({
            sql: 'UPDATE salaries SET mot_de_passe = ?, premiere_connexion = 0 WHERE id = ?',
            args: [hash, userId]
        });
        return { success: true };
    });

    safeHandle('resetPassword', async (event, salarieId) => {
        await ctx.db.execute({
            sql: 'UPDATE salaries SET mot_de_passe = NULL, premiere_connexion = 1 WHERE id = ?',
            args: [salarieId]
        });
        return { success: true };
    });

};
