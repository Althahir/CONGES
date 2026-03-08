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
        return new Promise((resolve, reject) => {
            const { nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup } = salarieData;

            ctx.db.run(
                `INSERT INTO salaries (nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, role, actif, premiere_connexion)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'utilisateur', 1, 1)`,
                [nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup],
                function(err) {
                    if (err) {
                        console.error('Erreur création salarié:', err);
                        if (err.message && err.message.includes('UNIQUE constraint failed')) {
                            resolve({ success: false, message: 'Cette adresse email est déjà assignée à un salarié' });
                        } else {
                            resolve({ success: false, message: 'Erreur lors de l\'enregistrement : ' + err.message });
                        }
                        return;
                    } else {
                        console.log('Salarié créé avec ID:', this.lastID);

                        // Créer les soldes pour l'année en cours
                        const annee = new Date().getFullYear();
                        ctx.db.run(
                            `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures)
                             VALUES (?, ?, 0, 0, 0, 0)`,
                            [this.lastID, annee],
                            (errSoldes) => {
                                if (errSoldes) {
                                    console.error('Erreur création soldes:', errSoldes);
                                }
                            }
                        );

                        resolve({ success: true, id: this.lastID });
                    }
                }
            );
        });
    });

    safeHandle('updateSalarie', async (event, salarieId, salarieData) => {
        return new Promise((resolve, reject) => {
            const { nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup } = salarieData;

            ctx.db.run(
                `UPDATE salaries
                 SET nom = ?, prenom = ?, email = ?, date_embauche = ?, type_contrat = ?,
                     cp_mensuel = ?, a_droit_rtt = ?, a_droit_recup = ?
                 WHERE id = ?`,
                [nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, salarieId],
                function(err) {
                    if (err) {
                        console.error('Erreur modification salarié:', err);
                        if (err.message && err.message.includes('UNIQUE constraint failed')) {
                            resolve({ success: false, message: 'Cette adresse email est déjà assignée à un salarié' });
                        } else {
                            resolve({ success: false, message: 'Erreur lors de la modification : ' + err.message });
                        }
                        return;
                    } else {
                        resolve({ success: true });
                    }
                }
            );
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
