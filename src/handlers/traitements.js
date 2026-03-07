module.exports = function registerTraitementsHandlers(ctx, safeHandle) {

    // ========== CONFIGURATION ==========

    safeHandle('getConfigTraitements', async (event) => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM config_traitements ORDER BY type', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    safeHandle('updateConfigTraitement', async (event, type, jour, mois) => {
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'UPDATE config_traitements SET jour = ?, mois = ?, derniere_maj = CURRENT_TIMESTAMP WHERE type = ?',
                [jour, mois, type],
                (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    safeHandle('logHistoriqueTraitement', async (event, data) => {
        const { type, annee, nb_salaries_traites, details, statut, message_erreur } = data;
        return new Promise((resolve, reject) => {
            ctx.db.run(
                'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                [type, annee, nb_salaries_traites || 0, details || '', statut, message_erreur || ''],
                (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    safeHandle('getHistoriqueTraitements', async (event) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
                'SELECT * FROM historique_traitements ORDER BY date_execution DESC LIMIT 20',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    });

    // ========== TRAITEMENT CP ANNUEL (IPC) ==========

    safeHandle('executerTraitementCP', async (event, annee) => {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM salaries WHERE actif = 1', async (err, salaries) => {
                if (err) {
                    reject(err);
                    return;
                }

                let nbMisAJour = 0;
                let details = [];
                let erreurs = [];

                for (const salarie of salaries) {
                    try {
                        const dateEmbauche = new Date(salarie.date_embauche);
                        const anneeEmbauche = dateEmbauche.getFullYear();

                        let cpNouveaux = salarie.cp_mensuel * 12;

                        const soldes = await new Promise((res, rej) => {
                            ctx.db.get(
                                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                [salarie.id, annee],
                                (err, row) => {
                                    if (err) rej(err);
                                    else res(row);
                                }
                            );
                        });

                        if (soldes) {
                            const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                            const nouveauCPN = cpNouveaux;

                            await new Promise((res, rej) => {
                                ctx.db.run(
                                    'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                    [nouveauCPN1, nouveauCPN, salarie.id, annee],
                                    (err) => {
                                        if (err) rej(err);
                                        else res();
                                    }
                                );
                            });

                            nbMisAJour++;
                            details.push({
                                salarie_id: salarie.id,
                                nom: `${salarie.prenom} ${salarie.nom}`,
                                cp_transferes: soldes.cp_n.toFixed(2),
                                nouveau_cp_n1: nouveauCPN1.toFixed(2),
                                nouveaux_cp_n: nouveauCPN.toFixed(2)
                            });
                        }

                    } catch (error) {
                        console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                        erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                    }
                }

                const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

                ctx.db.run(
                    'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                    ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                    (err) => {
                        if (err) console.error('Erreur enregistrement historique:', err);
                    }
                );

                const notifTitreCP = statut === 'success' ? 'Traitement CP Annuel effectué' : (statut === 'partial' ? 'Traitement CP Annuel partiel' : 'Erreur traitement CP Annuel');
                const notifMessageCP = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
                ctx.db.run(
                    `INSERT INTO notifications (type, titre, message, statut) VALUES ('traitement', ?, ?, ?)`,
                    [notifTitreCP, notifMessageCP, statut]
                );

                resolve({
                    success: statut !== 'error',
                    statut,
                    nbMisAJour,
                    details,
                    erreurs
                });
            });
        });
    });

    // ========== TRAITEMENT RTT ANNUEL (IPC) ==========

    safeHandle('executerTraitementRTT', async (event, annee) => {
        return new Promise((resolve, reject) => {
            console.log('Recherche RTT pour annee:', annee, 'type:', typeof annee);
            ctx.db.get('SELECT * FROM rtt_annuels WHERE annee_debut = ?', [annee], async (err, rttAnnuel) => {
                console.log('Erreur DB:', err);
                console.log('Résultat DB:', rttAnnuel);
                if (err) {
                    reject(err);
                    return;
                }

                if (!rttAnnuel) {
                    reject(new Error(`Aucun paramètre RTT configuré pour l'année ${annee}. Rendez-vous dans Planning des traitements pour les renseigner.`));
                    return;
                }

                const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);

                ctx.db.all('SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1', async (err, salaries) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let nbMisAJour = 0;
                    let details = [];
                    let erreurs = [];

                    for (const salarie of salaries) {
                        try {
                            const dateEmbauche = new Date(salarie.date_embauche);
                            const anneeEmbauche = dateEmbauche.getFullYear();

                            let rttAjouter = nbRTT;

                            if (anneeEmbauche === annee) {
                                const dateDebut = new Date(annee, 0, 1);
                                const dateFin = new Date(annee, 11, 31);
                                const joursAnneeTravailles = Math.ceil((dateFin - dateEmbauche) / (1000 * 60 * 60 * 24));
                                const joursAnnee = Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24));
                                rttAjouter = (nbRTT * joursAnneeTravailles) / joursAnnee;
                            }

                            const soldes = await new Promise((res, rej) => {
                                ctx.db.get(
                                    'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                    [salarie.id, annee],
                                    (err, row) => {
                                        if (err) rej(err);
                                        else res(row);
                                    }
                                );
                            });

                            if (soldes) {
                                const nouveauRTT = soldes.rtt + rttAjouter;

                                await new Promise((res, rej) => {
                                    ctx.db.run(
                                        'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                        [nouveauRTT, salarie.id, annee],
                                        (err) => {
                                            if (err) rej(err);
                                            else res();
                                        }
                                    );
                                });

                                nbMisAJour++;
                                details.push({
                                    salarie_id: salarie.id,
                                    nom: `${salarie.prenom} ${salarie.nom}`,
                                    rtt_ajoutes: rttAjouter.toFixed(2),
                                    nouveau_solde: nouveauRTT.toFixed(2)
                                });
                            }

                        } catch (error) {
                            console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                            erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                        }
                    }

                    const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

                    ctx.db.run(
                        'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                        ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                        (err) => {
                            if (err) console.error('Erreur enregistrement historique:', err);
                        }
                    );

                    const notifTitreRTT = statut === 'success' ? 'Traitement RTT Annuel effectué' : (statut === 'partial' ? 'Traitement RTT Annuel partiel' : 'Erreur traitement RTT Annuel');
                    const notifMessageRTT = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
                    ctx.db.run(
                        `INSERT INTO notifications (type, titre, message, statut) VALUES ('traitement', ?, ?, ?)`,
                        [notifTitreRTT, notifMessageRTT, statut]
                    );

                    resolve({
                        success: statut !== 'error',
                        statut,
                        nbMisAJour,
                        details,
                        erreurs
                    });
                });
            });
        });
    });

    // ========== VERIFICATION AUTOMATIQUE DES TRAITEMENTS ==========

    async function verifierTraitementsAutomatiques() {
        console.log('Vérification des traitements automatiques...');

        const aujourdhui = new Date();
        const annee = aujourdhui.getFullYear();
        const mois = aujourdhui.getMonth() + 1;
        const jour = aujourdhui.getDate();

        try {
            const config = await new Promise((resolve, reject) => {
                ctx.db.all('SELECT * FROM config_traitements WHERE actif = 1', (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            for (const conf of config) {
                if (conf.jour === jour && conf.mois === mois) {
                    console.log(`Date de traitement ${conf.type} atteinte !`);

                    const dejaFait = await new Promise((resolve, reject) => {
                        ctx.db.get(
                            'SELECT * FROM historique_traitements WHERE type = ? AND annee = ? AND statut = "success"',
                            [conf.type, annee],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    if (!dejaFait) {
                        console.log(`Exécution du traitement ${conf.type}...`);

                        if (conf.type === 'CP_ANNUEL') {
                            await executerTraitementCPAuto(annee);
                        } else if (conf.type === 'RTT_ANNUEL') {
                            await executerTraitementRTTAuto(annee);
                        }
                    } else {
                        console.log(`Traitement ${conf.type} déjà effectué cette année`);
                    }
                }
            }

            // Vérifier si les RTT de l'année suivante ne sont toujours pas configurés
            const rttConfig = config.find(c => c.type === 'RTT_ANNUEL');
            if (rttConfig) {
                let moisRappel = rttConfig.mois + 1;
                let anneeRappel = annee;
                if (moisRappel > 12) { moisRappel = 1; anneeRappel++; }

                if (mois === moisRappel && jour === rttConfig.jour) {
                    const traitementFait = await new Promise((res, rej) => {
                        ctx.db.get('SELECT * FROM historique_traitements WHERE type = "RTT_ANNUEL" AND annee = ? AND statut = "success"',
                            [annee], (err, row) => { if (err) rej(err); else res(row); });
                    });

                    if (traitementFait) {
                        const rttNextYear = await new Promise((res, rej) => {
                            ctx.db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee + 1],
                                (err, row) => { if (err) rej(err); else res(row); });
                        });

                        if (!rttNextYear) {
                            const dejaNotifie = await new Promise((res, rej) => {
                                ctx.db.get(`SELECT id FROM notifications WHERE type = 'error' AND titre = 'Paramètres RTT manquants'
                                        AND message LIKE '%${annee + 1}%' AND date_creation > datetime('now', '-30 days')`,
                                    (err, row) => { if (err) rej(err); else res(row); });
                            });

                            if (!dejaNotifie) {
                                const admins = await new Promise((res, rej) => {
                                    ctx.db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                                        (err, rows) => { if (err) rej(err); else res(rows || []); });
                                });
                                admins.forEach(admin => {
                                    ctx.db.run(
                                        'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                        [admin.id, 'error', 'Paramètres RTT manquants',
                                         `Les paramètres RTT pour ${annee + 1} ne sont toujours pas configurés (rappel 1 mois après traitement). Le prochain traitement RTT échouera sans ces paramètres.`]
                                    );
                                });
                                console.log(`Rappel envoyé : RTT ${annee + 1} non configurés`);
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Erreur vérification traitements:', error);
        }
    }

    // Traitement CP automatique
    async function executerTraitementCPAuto(annee) {
        return new Promise((resolve, reject) => {
            ctx.db.all('SELECT * FROM salaries WHERE actif = 1', async (err, salaries) => {
                if (err) {
                    console.error('Erreur récupération salariés:', err);
                    reject(err);
                    return;
                }

                let nbMisAJour = 0;
                let details = [];
                let erreurs = [];

                for (const salarie of salaries) {
                    try {
                        const cpNouveaux = salarie.cp_mensuel * 12;

                        const soldes = await new Promise((res, rej) => {
                            ctx.db.get(
                                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                [salarie.id, annee],
                                (err, row) => {
                                    if (err) rej(err);
                                    else res(row);
                                }
                            );
                        });

                        if (soldes) {
                            const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                            const nouveauCPN = cpNouveaux;

                            await new Promise((res, rej) => {
                                ctx.db.run(
                                    'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                    [nouveauCPN1, nouveauCPN, salarie.id, annee],
                                    (err) => {
                                        if (err) rej(err);
                                        else res();
                                    }
                                );
                            });

                            nbMisAJour++;
                            details.push({
                                salarie_id: salarie.id,
                                nom: `${salarie.prenom} ${salarie.nom}`,
                                cp_transferes: soldes.cp_n.toFixed(2),
                                nouveau_cp_n1: nouveauCPN1.toFixed(2),
                                nouveaux_cp_n: nouveauCPN.toFixed(2)
                            });
                        }
                    } catch (error) {
                        console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                        erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                    }
                }

                const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

                ctx.db.run(
                    'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                    ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                    (err) => {
                        if (err) console.error('Erreur enregistrement historique:', err);
                    }
                );

                if (ctx.mainWindow && ctx.mainWindow.webContents) {
                    ctx.mainWindow.webContents.send('traitement-automatique', {
                        type: 'CP_ANNUEL',
                        statut,
                        nbSalaries: nbMisAJour,
                        details,
                        erreurs
                    });
                }

                console.log(`Traitement CP terminé: ${nbMisAJour} salariés traités`);
                resolve({ success: statut !== 'error', nbMisAJour, statut });
            });
        });
    }

    // Traitement RTT automatique
    async function executerTraitementRTTAuto(annee) {
        return new Promise((resolve, reject) => {
            ctx.db.get('SELECT * FROM rtt_annuels WHERE annee_debut = ?', [annee], async (err, rttAnnuel) => {
                if (err) {
                    console.error('Erreur récupération RTT:', err);
                    reject(err);
                    return;
                }

                if (!rttAnnuel) {
                    console.error(`Aucun paramètre RTT pour ${annee}`);
                    ctx.db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1", (err2, admins) => {
                        if (!err2 && admins) {
                            admins.forEach(admin => {
                                ctx.db.run(
                                    'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                    [admin.id, 'warning', 'Traitement RTT impossible',
                                     `Les paramètres RTT pour l'année ${annee} ne sont pas configurés. Rendez-vous dans Planning des traitements pour les renseigner.`]
                                );
                            });
                        }
                    });
                    reject(new Error(`Aucun paramètre RTT pour ${annee}`));
                    return;
                }

                const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);

                ctx.db.all('SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1', async (err, salaries) => {
                    if (err) {
                        console.error('Erreur récupération salariés RTT:', err);
                        reject(err);
                        return;
                    }

                    let nbMisAJour = 0;
                    let details = [];
                    let erreurs = [];

                    for (const salarie of salaries) {
                        try {
                            const dateEmbauche = new Date(salarie.date_embauche);
                            const anneeEmbauche = dateEmbauche.getFullYear();

                            let rttAjouter = nbRTT;

                            if (anneeEmbauche === annee) {
                                const dateDebut = new Date(annee, 0, 1);
                                const dateFin = new Date(annee, 11, 31);
                                const joursAnneeTravailles = Math.ceil((dateFin - dateEmbauche) / (1000 * 60 * 60 * 24));
                                const joursAnnee = Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24));
                                rttAjouter = (nbRTT * joursAnneeTravailles) / joursAnnee;
                            }

                            const soldes = await new Promise((res, rej) => {
                                ctx.db.get(
                                    'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                    [salarie.id, annee],
                                    (err, row) => {
                                        if (err) rej(err);
                                        else res(row);
                                    }
                                );
                            });

                            if (soldes) {
                                const nouveauRTT = soldes.rtt + rttAjouter;

                                await new Promise((res, rej) => {
                                    ctx.db.run(
                                        'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                        [nouveauRTT, salarie.id, annee],
                                        (err) => {
                                            if (err) rej(err);
                                            else res();
                                        }
                                    );
                                });

                                nbMisAJour++;
                                details.push({
                                    salarie_id: salarie.id,
                                    nom: `${salarie.prenom} ${salarie.nom}`,
                                    rtt_ajoutes: rttAjouter.toFixed(2),
                                    nouveau_solde: nouveauRTT.toFixed(2)
                                });
                            }
                        } catch (error) {
                            console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                            erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                        }
                    }

                    const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

                    ctx.db.run(
                        'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                        ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                        (err) => {
                            if (err) console.error('Erreur enregistrement historique:', err);
                        }
                    );

                    if (ctx.mainWindow && ctx.mainWindow.webContents) {
                        ctx.mainWindow.webContents.send('traitement-automatique', {
                            type: 'RTT_ANNUEL',
                            statut,
                            nbSalaries: nbMisAJour,
                            details,
                            erreurs
                        });
                    }

                    console.log(`Traitement RTT terminé: ${nbMisAJour} salariés traités`);

                    ctx.db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee + 1], (err3, nextYear) => {
                        if (!err3 && !nextYear) {
                            ctx.db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1", (err4, admins) => {
                                if (!err4 && admins) {
                                    admins.forEach(admin => {
                                        ctx.db.run(
                                            'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                            [admin.id, 'info', 'Paramètres RTT à configurer',
                                             `Le traitement RTT ${annee} s'est bien déroulé. Pensez à configurer les paramètres RTT pour ${annee + 1} dans Planning des traitements.`]
                                        );
                                    });
                                }
                            });
                        }
                    });

                    resolve({ success: statut !== 'error', nbMisAJour, statut });
                });
            });
        });
    }

    // Expose la fonction de vérification pour l'appeler depuis main.js
    return { verifierTraitementsAutomatiques };

};
