const { calculerCPMensuel, getTauxGlobaux, getJoursFeriesAnnee } = require('./utils-cp');

module.exports = function registerSalariesHandlers(ctx, safeHandle) {

    safeHandle('getSalarie', async (event, id) => {
        const result = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE id = ?', args: [id] });
        return result.rows[0];
    });

    safeHandle('getAllSalaries', async (event) => {
        const result = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE actif = 1 ORDER BY nom, prenom', args: [] });
        return result.rows;
    });

    safeHandle('createSalarie', async (event, salarieData) => {
        const { nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie } = salarieData;

        let insertResult;
        try {
            insertResult = await ctx.db.execute({
                sql: `INSERT INTO salaries (nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie, role, actif, premiere_connexion)
                     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'utilisateur', 1, 1)`,
                args: [nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie || 0, date_arret_maladie || null]
            });
        } catch (err) {
            console.error('Erreur création salarié:', err);
            if (err.message && err.message.includes('UNIQUE')) {
                return { success: false, message: 'Cette adresse email est déjà assignée à un salarié' };
            }
            return { success: false, message: 'Erreur lors de l\'enregistrement : ' + err.message };
        }

        const newId = Number(insertResult.lastInsertRowid);
        console.log('Salarié créé avec ID:', newId);

        const now = new Date();
        const annee = now.getFullYear();
        const moisCourant = now.getMonth() + 1;

        // Si créé en arrêt maladie, log dans historique_taux
        const historique = [];
        if (en_arret_maladie) {
            const dateEffet = date_arret_maladie || date_embauche;
            historique.push({ date_effet: dateEffet, ancien_taux: 'normal', nouveau_taux: 'arret' });
            await ctx.db.execute({
                sql: `INSERT INTO historique_taux (salarie_id, date_effet, ancien_taux, nouveau_taux) VALUES (?, ?, 'normal', 'arret')`,
                args: [newId, dateEffet]
            });
        }

        // Calculer le prorata CP initial depuis la date d'embauche
        let cpInitial = 0;
        try {
            const taux = await getTauxGlobaux(ctx.db);
            const salarieObj = { date_embauche };
            const dateEmb = new Date(date_embauche);
            const anneeDebut = dateEmb.getFullYear() < annee ? annee : dateEmb.getFullYear();

            for (let a = anneeDebut; a <= annee; a++) {
                const joursFeries = await getJoursFeriesAnnee(ctx.db, a);
                const mDebut = (a === anneeDebut && dateEmb.getFullYear() === a) ? (dateEmb.getMonth() + 1) : 1;
                const mFin = (a === annee) ? moisCourant : 12;
                for (let m = mDebut; m <= mFin; m++) {
                    cpInitial += calculerCPMensuel(salarieObj, a, m, taux, historique, joursFeries);
                }
            }
            console.log(`CP initial calculé pour ${nom} ${prenom}: ${cpInitial.toFixed(5)}`);
        } catch (errCalc) {
            console.error('Erreur calcul prorata initial:', errCalc);
        }

        // Créer les soldes avec le CP initial calculé
        try {
            await ctx.db.execute({
                sql: `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, ?, 0, 0, 0)`,
                args: [newId, annee, cpInitial]
            });
        } catch (err) {
            console.error('Erreur création soldes:', err);
        }

        return { success: true, id: newId };
    });

    safeHandle('updateSalarie', async (event, salarieId, salarieData) => {
        const { nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie } = salarieData;

        // Récupérer l'ancien état pour détecter un changement de statut maladie
        const ancienResult = await ctx.db.execute({
            sql: 'SELECT en_arret_maladie, date_arret_maladie FROM salaries WHERE id = ?',
            args: [salarieId]
        });
        const ancien = ancienResult.rows[0];

        const ancienArret = ancien ? (ancien.en_arret_maladie || 0) : 0;
        const nouvelArret = en_arret_maladie || 0;

        try {
            await ctx.db.execute({
                sql: `UPDATE salaries SET nom = ?, prenom = ?, email = ?, date_embauche = ?, type_contrat = ?,
                     a_droit_rtt = ?, a_droit_recup = ?, en_arret_maladie = ?, date_arret_maladie = ? WHERE id = ?`,
                args: [nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, nouvelArret, date_arret_maladie || null, salarieId]
            });
        } catch (err) {
            console.error('Erreur modification salarié:', err);
            if (err.message && err.message.includes('UNIQUE')) {
                return { success: false, message: 'Cette adresse email est déjà assignée à un salarié' };
            }
            return { success: false, message: 'Erreur lors de la modification : ' + err.message };
        }

        // Détecter changement de statut maladie → log historique_taux
        if (ancienArret !== nouvelArret && date_arret_maladie) {
            const ancienTaux = ancienArret ? 'arret' : 'normal';
            const nouveauTaux = nouvelArret ? 'arret' : 'normal';
            try {
                await ctx.db.execute({
                    sql: `INSERT INTO historique_taux (salarie_id, date_effet, ancien_taux, nouveau_taux) VALUES (?, ?, ?, ?)`,
                    args: [salarieId, date_arret_maladie, ancienTaux, nouveauTaux]
                });
            } catch (e) {
                console.error('Erreur log historique taux:', e);
            }
        }

        return { success: true };
    });

    safeHandle('deactivateSalarie', async (event, salarieId) => {
        await ctx.db.execute({
            sql: 'UPDATE salaries SET actif = 0 WHERE id = ?',
            args: [salarieId]
        });
        return { success: true };
    });

};
