const { calculerCPMensuel, getTauxGlobaux, getJoursFeriesAnnee } = require('./utils-cp');

module.exports = function registerSalariesHandlers(ctx, safeHandle) {

    safeHandle('getSalarie', async (event, id) => {
        return new Promise((resolve, reject) => {
            ctx.db.get('SELECT * FROM salaries WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    });

    safeHandle('getAllSalaries', async (event) => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM salaries WHERE actif = 1 ORDER BY nom, prenom', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    safeHandle('createSalarie', async (event, salarieData) => {
        const { nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie } = salarieData;

        // 1. Insérer le salarié
        const insertResult = await new Promise((resolve) => {
            ctx.db.run(
                `INSERT INTO salaries (nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie, role, actif, premiere_connexion)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'utilisateur', 1, 1)`,
                [nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie || 0, date_arret_maladie || null],
                function(err) {
                    if (err) {
                        console.error('Erreur création salarié:', err);
                        if (err.message && err.message.includes('UNIQUE constraint failed')) {
                            resolve({ success: false, message: 'Cette adresse email est déjà assignée à un salarié' });
                        } else {
                            resolve({ success: false, message: 'Erreur lors de l\'enregistrement : ' + err.message });
                        }
                    } else {
                        console.log('Salarié créé avec ID:', this.lastID);
                        resolve({ success: true, id: this.lastID });
                    }
                }
            );
        });

        if (!insertResult.success) return insertResult;

        const newId = insertResult.id;
        const now = new Date();
        const annee = now.getFullYear();
        const moisCourant = now.getMonth() + 1;

        // 2. Si créé en arrêt maladie, log dans historique_taux
        const historique = [];
        if (en_arret_maladie) {
            const dateEffet = date_arret_maladie || date_embauche;
            historique.push({ date_effet: dateEffet, ancien_taux: 'normal', nouveau_taux: 'arret' });
            await new Promise((res) => {
                ctx.db.run(
                    `INSERT INTO historique_taux (salarie_id, date_effet, ancien_taux, nouveau_taux) VALUES (?, ?, 'normal', 'arret')`,
                    [newId, dateEffet],
                    () => res()
                );
            });
        }

        // 3. Calculer le prorata CP initial depuis la date d'embauche
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

        // 4. Créer les soldes avec le CP initial calculé
        await new Promise((res) => {
            ctx.db.run(
                `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures)
                 VALUES (?, ?, ?, 0, 0, 0)`,
                [newId, annee, cpInitial],
                (err) => {
                    if (err) console.error('Erreur création soldes:', err);
                    res();
                }
            );
        });

        return { success: true, id: newId };
    });

    safeHandle('updateSalarie', async (event, salarieId, salarieData) => {
        return new Promise((resolve, reject) => {
            const { nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, en_arret_maladie, date_arret_maladie } = salarieData;

            // Récupérer l'ancien état pour détecter un changement de statut maladie
            ctx.db.get('SELECT en_arret_maladie, date_arret_maladie FROM salaries WHERE id = ?', [salarieId], (errGet, ancien) => {
                if (errGet) {
                    reject(errGet);
                    return;
                }

                const ancienArret = ancien ? (ancien.en_arret_maladie || 0) : 0;
                const nouvelArret = en_arret_maladie || 0;

                ctx.db.run(
                    `UPDATE salaries
                     SET nom = ?, prenom = ?, email = ?, date_embauche = ?, type_contrat = ?,
                         a_droit_rtt = ?, a_droit_recup = ?, en_arret_maladie = ?, date_arret_maladie = ?
                     WHERE id = ?`,
                    [nom, prenom, email, date_embauche, type_contrat, a_droit_rtt, a_droit_recup, nouvelArret, date_arret_maladie || null, salarieId],
                    function(err) {
                        if (err) {
                            console.error('Erreur modification salarié:', err);
                            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                                resolve({ success: false, message: 'Cette adresse email est déjà assignée à un salarié' });
                            } else {
                                resolve({ success: false, message: 'Erreur lors de la modification : ' + err.message });
                            }
                            return;
                        }

                        // Détecter changement de statut maladie → log historique_taux
                        if (ancienArret !== nouvelArret && date_arret_maladie) {
                            const ancienTaux = ancienArret ? 'arret' : 'normal';
                            const nouveauTaux = nouvelArret ? 'arret' : 'normal';
                            ctx.db.run(
                                `INSERT INTO historique_taux (salarie_id, date_effet, ancien_taux, nouveau_taux) VALUES (?, ?, ?, ?)`,
                                [salarieId, date_arret_maladie, ancienTaux, nouveauTaux]
                            );
                        }

                        resolve({ success: true });
                    }
                );
            });
        });
    });

    safeHandle('deactivateSalarie', async (event, salarieId) => {
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'UPDATE salaries SET actif = 0 WHERE id = ?',
                [salarieId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

};
