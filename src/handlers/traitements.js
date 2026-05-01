const { calculerCPMensuel, calculerCPMensuelDetail, getTauxGlobaux: getTauxGlobauxUtil, getJoursFeriesAnnee } = require('./utils-cp');

module.exports = function registerTraitementsHandlers(ctx, safeHandle) {

    const MOIS_NOMS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    function getTauxGlobaux() {
        return getTauxGlobauxUtil(ctx.db);
    }

    // Crée une notification ciblée pour chaque admin actif (cloche + toast).
    async function notifierAdminsTraitement(titre, message, statut) {
        try {
            const adminsResult = await ctx.db.execute({
                sql: "SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                args: []
            });
            for (const admin of adminsResult.rows) {
                await ctx.db.execute({
                    sql: "INSERT INTO notifications (user_id, type, titre, message, statut) VALUES (?, 'traitement', ?, ?, ?)",
                    args: [admin.id, titre, message, statut]
                });
            }
        } catch (e) { console.error('Erreur création notifs admins:', e); }
    }

    // ========== CONFIGURATION ==========

    safeHandle('getConfigTraitements', async (event) => {
        const result = await ctx.db.execute({ sql: 'SELECT * FROM config_traitements ORDER BY type', args: [] });
        return result.rows;
    });

    safeHandle('updateConfigTraitement', async (event, type, jour, mois) => {
        await ctx.db.execute({
            sql: 'UPDATE config_traitements SET jour = ?, mois = ?, derniere_maj = CURRENT_TIMESTAMP WHERE type = ?',
            args: [jour, mois, type]
        });
        return { success: true };
    });

    safeHandle('logHistoriqueTraitement', async (event, data) => {
        const { type, annee, nb_salaries_traites, details, statut, message_erreur } = data;
        await ctx.db.execute({
            sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
            args: [type, annee, nb_salaries_traites || 0, details || '', statut, message_erreur || '']
        });
        return { success: true };
    });

    safeHandle('getHistoriqueTraitements', async (event) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM historique_traitements ORDER BY date_execution DESC LIMIT 20',
            args: []
        });
        return result.rows;
    });

    // ========== TRAITEMENT CP MENSUEL (IPC) ==========

    safeHandle('executerTraitementCPMensuel', async (event, annee, mois) => {
        const salariesResult = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE actif = 1', args: [] });
        const salaries = salariesResult.rows;

        const taux = await getTauxGlobaux();
        const joursFeries = await getJoursFeriesAnnee(ctx.db, annee);
        let nbMisAJour = 0;
        let details = [];
        let erreurs = [];

        for (const salarie of salaries) {
            try {
                const histResult = await ctx.db.execute({
                    sql: 'SELECT * FROM historique_taux WHERE salarie_id = ? ORDER BY date_effet ASC',
                    args: [salarie.id]
                });
                const historique = histResult.rows;

                const calculDetail = calculerCPMensuelDetail(salarie, annee, mois, taux, historique, joursFeries);
                const cpAAjouter = calculDetail.total;
                if (cpAAjouter <= 0) continue;

                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (!soldes) {
                    await ctx.db.execute({
                        sql: 'INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, 0, 0, 0, 0)',
                        args: [salarie.id, annee]
                    });
                }

                const ancienCPN = soldes ? soldes.cp_n : 0;
                const nouveauCPN = ancienCPN + cpAAjouter;

                await ctx.db.execute({
                    sql: 'UPDATE soldes SET cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                    args: [nouveauCPN, salarie.id, annee]
                });

                nbMisAJour++;
                details.push({
                    salarie_id: salarie.id,
                    nom: `${salarie.prenom} ${salarie.nom}`,
                    ancien_cp_n: ancienCPN,
                    cp_ajoutes: cpAAjouter,
                    nouveau_cp_n: nouveauCPN,
                    // Audit complet (utile pour reconstituer le calcul a posteriori)
                    audit: {
                        date_embauche: calculDetail.dateEmbauche,
                        en_arret_maladie: calculDetail.enArretMaladie,
                        date_arret_maladie: calculDetail.dateArretMaladie,
                        nb_historique_taux: calculDetail.nbHistoriqueTaux,
                        taux_normal: calculDetail.tauxNormal,
                        taux_arret: calculDetail.tauxArret,
                        fallback_arret_applique: calculDetail.fallbackArretApplique,
                        nb_jours_mois: calculDetail.nbJoursMois,
                        jour_debut: calculDetail.jourDebut,
                        total_jours_ouvres: calculDetail.totalJoursOuvres,
                        segments: calculDetail.segments
                    }
                });

            } catch (error) {
                console.error(`Erreur CP mensuel pour ${salarie.prenom} ${salarie.nom}:`, error);
                erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
            }
        }

        const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: [`CP_MENSUEL_${mois}`, annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const moisLabel = MOIS_NOMS[mois] ? `${MOIS_NOMS[mois]} ${annee}` : `mois ${mois} ${annee}`;
        const notifTitre = statut === 'success' ? `Traitement CP mensuel (${moisLabel}) effectué` : `Traitement CP mensuel (${moisLabel}) — erreurs`;
        const notifMessage = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s)` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitre, notifMessage, statut);

        return { success: statut !== 'error', statut, nbMisAJour, details, erreurs };
    });

    // ========== TRAITEMENT CP ANNUEL (IPC) — basculement N → N-1 uniquement ==========

    safeHandle('executerTraitementCP', async (event, annee) => {
        const salariesResult = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE actif = 1', args: [] });
        const salaries = salariesResult.rows;

        let nbMisAJour = 0;
        let details = [];
        let erreurs = [];

        for (const salarie of salaries) {
            try {
                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (soldes) {
                    const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                    const nouveauCPN = 0;

                    await ctx.db.execute({
                        sql: 'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                        args: [nouveauCPN1, nouveauCPN, salarie.id, annee]
                    });

                    nbMisAJour++;
                    details.push({
                        salarie_id: salarie.id,
                        nom: `${salarie.prenom} ${salarie.nom}`,
                        cp_transferes: soldes.cp_n.toFixed(2),
                        nouveau_cp_n1: nouveauCPN1.toFixed(2),
                        nouveaux_cp_n: '0.00'
                    });
                }
            } catch (error) {
                console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
            }
        }

        const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const notifTitreCP = statut === 'success' ? 'Basculement CP annuel effectué' : (statut === 'partial' ? 'Basculement CP annuel partiel' : 'Erreur basculement CP annuel');
        const notifMessageCP = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) — CP N transférés en CP N-1` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitreCP, notifMessageCP, statut);

        return { success: statut !== 'error', statut, nbMisAJour, details, erreurs };
    });

    // ========== TRAITEMENT RTT ANNUEL (IPC) ==========

    safeHandle('executerTraitementRTT', async (event, annee) => {
        console.log('Recherche RTT pour annee:', annee, 'type:', typeof annee);
        const rttResult = await ctx.db.execute({
            sql: 'SELECT * FROM rtt_annuels WHERE annee_debut = ?',
            args: [annee]
        });
        const rttAnnuel = rttResult.rows[0];
        console.log('Résultat DB:', rttAnnuel);

        if (!rttAnnuel) {
            throw new Error(`Aucun paramètre RTT configuré pour l'année ${annee}. Rendez-vous dans Planning des traitements pour les renseigner.`);
        }

        const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);

        const salariesResult = await ctx.db.execute({
            sql: 'SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1',
            args: []
        });
        const salaries = salariesResult.rows;

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

                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (soldes) {
                    const nouveauRTT = soldes.rtt + rttAjouter;

                    await ctx.db.execute({
                        sql: 'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                        args: [nouveauRTT, salarie.id, annee]
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

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const notifTitreRTT = statut === 'success' ? 'Traitement RTT Annuel effectué' : (statut === 'partial' ? 'Traitement RTT Annuel partiel' : 'Erreur traitement RTT Annuel');
        const notifMessageRTT = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitreRTT, notifMessageRTT, statut);

        return { success: statut !== 'error', statut, nbMisAJour, details, erreurs };
    });

    // ========== VERIFICATION AUTOMATIQUE DES TRAITEMENTS ==========

    async function verifierTraitementsAutomatiques() {
        console.log('Vérification des traitements automatiques...');

        const aujourdhui = new Date();
        const annee = aujourdhui.getFullYear();
        const mois = aujourdhui.getMonth() + 1;
        const jour = aujourdhui.getDate();

        try {
            // --- Traitement CP mensuel automatique (1er du mois) ---
            if (jour === 1) {
                let moisATraiter = mois - 1;
                let anneeATraiter = annee;
                if (moisATraiter === 0) { moisATraiter = 12; anneeATraiter--; }

                const dejaFaitResult = await ctx.db.execute({
                    sql: `SELECT * FROM historique_traitements WHERE type = ? AND annee = ? AND statut = 'success'`,
                    args: [`CP_MENSUEL_${moisATraiter}`, anneeATraiter]
                });

                if (!dejaFaitResult.rows[0]) {
                    console.log(`Exécution du traitement CP mensuel pour ${moisATraiter}/${anneeATraiter}...`);
                    await executerTraitementCPMensuelAuto(anneeATraiter, moisATraiter);
                } else {
                    console.log(`Traitement CP mensuel ${moisATraiter}/${anneeATraiter} déjà effectué`);
                }
            }

            // --- Traitements annuels (CP basculement + RTT) ---
            const configResult = await ctx.db.execute({
                sql: 'SELECT * FROM config_traitements WHERE actif = 1',
                args: []
            });
            const config = configResult.rows;

            for (const conf of config) {
                if (conf.jour === jour && conf.mois === mois) {
                    console.log(`Date de traitement ${conf.type} atteinte !`);

                    const dejaFaitResult = await ctx.db.execute({
                        sql: `SELECT * FROM historique_traitements WHERE type = ? AND annee = ? AND statut = 'success'`,
                        args: [conf.type, annee]
                    });

                    if (!dejaFaitResult.rows[0]) {
                        console.log(`Exécution du traitement ${conf.type}...`);
                        if (conf.type === 'CP_ANNUEL') {
                            await executerTraitementCPAnnuelAuto(annee);
                        } else if (conf.type === 'RTT_ANNUEL') {
                            await executerTraitementRTTAuto(annee);
                        }
                    } else {
                        console.log(`Traitement ${conf.type} déjà effectué cette année`);
                    }
                }
            }

            // Rappel RTT année suivante
            const rttConfig = config.find(c => c.type === 'RTT_ANNUEL');
            if (rttConfig) {
                let moisRappel = rttConfig.mois + 1;
                let anneeRappel = annee;
                if (moisRappel > 12) { moisRappel = 1; anneeRappel++; }

                if (mois === moisRappel && jour === rttConfig.jour) {
                    const traitementFaitResult = await ctx.db.execute({
                        sql: `SELECT * FROM historique_traitements WHERE type = 'RTT_ANNUEL' AND annee = ? AND statut = 'success'`,
                        args: [annee]
                    });

                    if (traitementFaitResult.rows[0]) {
                        const rttNextYearResult = await ctx.db.execute({
                            sql: 'SELECT id FROM rtt_annuels WHERE annee_debut = ?',
                            args: [annee + 1]
                        });

                        if (!rttNextYearResult.rows[0]) {
                            const dejaNotifieResult = await ctx.db.execute({
                                sql: `SELECT id FROM notifications WHERE type = 'error' AND titre = 'Paramètres RTT manquants'
                                      AND message LIKE '%' || ? || '%' AND date_creation > datetime('now', '-30 days')`,
                                args: [String(annee + 1)]
                            });

                            if (!dejaNotifieResult.rows[0]) {
                                const adminsResult = await ctx.db.execute({
                                    sql: "SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                                    args: []
                                });
                                for (const admin of adminsResult.rows) {
                                    try {
                                        await ctx.db.execute({
                                            sql: `INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime('now'), 0)`,
                                            args: [admin.id, 'error', 'Paramètres RTT manquants',
                                                `Les paramètres RTT pour ${annee + 1} ne sont toujours pas configurés (rappel 1 mois après traitement). Le prochain traitement RTT échouera sans ces paramètres.`]
                                        });
                                    } catch (e) { console.error('Erreur notification admin:', e); }
                                }
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

    // Traitement CP mensuel automatique
    async function executerTraitementCPMensuelAuto(annee, mois) {
        const taux = await getTauxGlobaux();
        const joursFeries = await getJoursFeriesAnnee(ctx.db, annee);

        const salariesResult = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE actif = 1', args: [] });
        const salaries = salariesResult.rows;

        let nbMisAJour = 0;
        let details = [];
        let erreurs = [];

        for (const salarie of salaries) {
            try {
                const histResult = await ctx.db.execute({
                    sql: 'SELECT * FROM historique_taux WHERE salarie_id = ? ORDER BY date_effet ASC',
                    args: [salarie.id]
                });
                const historique = histResult.rows;

                const calculDetail = calculerCPMensuelDetail(salarie, annee, mois, taux, historique, joursFeries);
                const cpAAjouter = calculDetail.total;
                if (cpAAjouter <= 0) continue;

                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (!soldes) {
                    await ctx.db.execute({
                        sql: 'INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, 0, 0, 0, 0)',
                        args: [salarie.id, annee]
                    });
                }

                const ancienCPN = soldes ? soldes.cp_n : 0;
                const nouveauCPN = ancienCPN + cpAAjouter;

                await ctx.db.execute({
                    sql: 'UPDATE soldes SET cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                    args: [nouveauCPN, salarie.id, annee]
                });

                nbMisAJour++;
                details.push({
                    salarie_id: salarie.id,
                    nom: `${salarie.prenom} ${salarie.nom}`,
                    ancien_cp_n: ancienCPN,
                    cp_ajoutes: cpAAjouter,
                    nouveau_cp_n: nouveauCPN,
                    // Audit complet (utile pour reconstituer le calcul a posteriori)
                    audit: {
                        date_embauche: calculDetail.dateEmbauche,
                        en_arret_maladie: calculDetail.enArretMaladie,
                        date_arret_maladie: calculDetail.dateArretMaladie,
                        nb_historique_taux: calculDetail.nbHistoriqueTaux,
                        taux_normal: calculDetail.tauxNormal,
                        taux_arret: calculDetail.tauxArret,
                        fallback_arret_applique: calculDetail.fallbackArretApplique,
                        nb_jours_mois: calculDetail.nbJoursMois,
                        jour_debut: calculDetail.jourDebut,
                        total_jours_ouvres: calculDetail.totalJoursOuvres,
                        segments: calculDetail.segments
                    }
                });

            } catch (error) {
                console.error(`Erreur CP mensuel pour ${salarie.prenom} ${salarie.nom}:`, error);
                erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
            }
        }

        const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: [`CP_MENSUEL_${mois}`, annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const moisLabelM = MOIS_NOMS[mois] ? `${MOIS_NOMS[mois]} ${annee}` : `mois ${mois} ${annee}`;
        const notifTitreM = statut === 'success' ? `Traitement CP mensuel (${moisLabelM}) effectué` : `Traitement CP mensuel (${moisLabelM}) — erreurs`;
        const notifMessageM = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s)` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitreM, notifMessageM, statut);

        if (ctx.mainWindow && ctx.mainWindow.webContents) {
            ctx.mainWindow.webContents.send('traitement-automatique', {
                type: `CP_MENSUEL_${mois}`,
                statut,
                nbSalaries: nbMisAJour,
                details,
                erreurs
            });
        }

        console.log(`Traitement CP mensuel ${mois}/${annee} terminé: ${nbMisAJour} salariés traités`);
        return { success: statut !== 'error', nbMisAJour, statut };
    }

    // Traitement CP annuel automatique (basculement N → N-1)
    async function executerTraitementCPAnnuelAuto(annee) {
        const salariesResult = await ctx.db.execute({ sql: 'SELECT * FROM salaries WHERE actif = 1', args: [] });
        const salaries = salariesResult.rows;

        let nbMisAJour = 0;
        let details = [];
        let erreurs = [];

        for (const salarie of salaries) {
            try {
                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (soldes) {
                    const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                    const nouveauCPN = 0;

                    await ctx.db.execute({
                        sql: 'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                        args: [nouveauCPN1, nouveauCPN, salarie.id, annee]
                    });

                    nbMisAJour++;
                    details.push({
                        salarie_id: salarie.id,
                        nom: `${salarie.prenom} ${salarie.nom}`,
                        cp_transferes: soldes.cp_n.toFixed(2),
                        nouveau_cp_n1: nouveauCPN1.toFixed(2),
                        nouveaux_cp_n: '0.00'
                    });
                }
            } catch (error) {
                console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
            }
        }

        const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const notifTitreA = statut === 'success' ? 'Basculement CP annuel effectué' : (statut === 'partial' ? 'Basculement CP annuel partiel' : 'Erreur basculement CP annuel');
        const notifMessageA = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) — CP N transférés en CP N-1` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitreA, notifMessageA, statut);

        if (ctx.mainWindow && ctx.mainWindow.webContents) {
            ctx.mainWindow.webContents.send('traitement-automatique', {
                type: 'CP_ANNUEL',
                statut,
                nbSalaries: nbMisAJour,
                details,
                erreurs
            });
        }

        console.log(`Basculement CP annuel terminé: ${nbMisAJour} salariés traités`);
        return { success: statut !== 'error', nbMisAJour, statut };
    }

    // Traitement RTT automatique
    async function executerTraitementRTTAuto(annee) {
        const rttResult = await ctx.db.execute({
            sql: 'SELECT * FROM rtt_annuels WHERE annee_debut = ?',
            args: [annee]
        });
        const rttAnnuel = rttResult.rows[0];

        if (!rttAnnuel) {
            console.error(`Aucun paramètre RTT pour ${annee}`);
            try {
                const adminsResult = await ctx.db.execute({
                    sql: "SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                    args: []
                });
                for (const admin of adminsResult.rows) {
                    await ctx.db.execute({
                        sql: `INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime('now'), 0)`,
                        args: [admin.id, 'warning', 'Traitement RTT impossible',
                            `Les paramètres RTT pour l'année ${annee} ne sont pas configurés. Rendez-vous dans Planning des traitements pour les renseigner.`]
                    });
                }
            } catch (e) { console.error('Erreur notification RTT:', e); }
            throw new Error(`Aucun paramètre RTT pour ${annee}`);
        }

        const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);

        const salariesResult = await ctx.db.execute({
            sql: 'SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1',
            args: []
        });
        const salaries = salariesResult.rows;

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

                const soldesResult = await ctx.db.execute({
                    sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                    args: [salarie.id, annee]
                });
                const soldes = soldesResult.rows[0];

                if (soldes) {
                    const nouveauRTT = soldes.rtt + rttAjouter;

                    await ctx.db.execute({
                        sql: 'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                        args: [nouveauRTT, salarie.id, annee]
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

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                args: ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null]
            });
        } catch (e) { console.error('Erreur enregistrement historique:', e); }

        const notifTitreRA = statut === 'success' ? 'Traitement RTT Annuel effectué' : (statut === 'partial' ? 'Traitement RTT Annuel partiel' : 'Erreur traitement RTT Annuel');
        const notifMessageRA = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
        await notifierAdminsTraitement(notifTitreRA, notifMessageRA, statut);

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

        // Notification pour configurer RTT N+1
        try {
            const nextYearResult = await ctx.db.execute({
                sql: 'SELECT id FROM rtt_annuels WHERE annee_debut = ?',
                args: [annee + 1]
            });
            if (!nextYearResult.rows[0]) {
                const adminsResult = await ctx.db.execute({
                    sql: "SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                    args: []
                });
                for (const admin of adminsResult.rows) {
                    await ctx.db.execute({
                        sql: `INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime('now'), 0)`,
                        args: [admin.id, 'info', 'Paramètres RTT à configurer',
                            `Le traitement RTT ${annee} s'est bien déroulé. Pensez à configurer les paramètres RTT pour ${annee + 1} dans Planning des traitements.`]
                    });
                }
            }
        } catch (e) { console.error('Erreur notification RTT N+1:', e); }

        return { success: statut !== 'error', nbMisAJour, statut };
    }

    // Expose la fonction de vérification pour l'appeler depuis main.js
    return { verifierTraitementsAutomatiques };

};
