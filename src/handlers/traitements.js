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

    safeHandle('executerTraitementCPMensuel', async (event, annee, mois, forcer = false) => {
        // Garde anti-double-crédit : relancer un mois déjà traité ajouterait une seconde
        // fois les CP à tous les salariés. 'forcer' reste possible pour une reprise
        // volontaire après correction de données.
        if (!forcer) {
            const dejaFait = await ctx.db.execute({
                sql: `SELECT date_execution FROM historique_traitements
                      WHERE type = ? AND annee = ? AND statut IN ('success', 'partial')
                      LIMIT 1`,
                args: [`CP_MENSUEL_${mois}`, annee]
            });
            if (dejaFait.rows[0]) {
                return {
                    success: false,
                    dejaFait: true,
                    statut: 'skipped',
                    nbMisAJour: 0,
                    details: [],
                    erreurs: [`Le traitement CP de ${MOIS_NOMS[mois] || `mois ${mois}`} ${annee} a déjà été effectué le ${dejaFait.rows[0].date_execution}.`]
                };
            }
        }

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

    // Un traitement n'est dû qu'une fois, mais l'app n'est pas forcément ouverte le jour
    // de l'échéance : 1er tombant un week-end ou un férié, période de congés, poste laissé
    // allumé sans redémarrage... On raisonne donc en « échéances passées non honorées »
    // et non en « sommes-nous le jour J ». Sans ça, un mois manqué était perdu à jamais
    // (cas réel : CP_MENSUEL_7 2026, dû le samedi 01/08/2026, jamais exécuté).
    const RATTRAPAGE_MAX_MOIS = 24;
    const VERROU_PERIME_HEURES = 2;

    function indexMois(m) { return m.annee * 12 + (m.mois - 1); }
    function moisSuivant(m) { return m.mois === 12 ? { annee: m.annee + 1, mois: 1 } : { annee: m.annee, mois: m.mois + 1 }; }
    function moisPrecedent(m) { return m.mois === 1 ? { annee: m.annee - 1, mois: 12 } : { annee: m.annee, mois: m.mois - 1 }; }

    // Verrou inter-postes. Toutes les instances Electron partagent la même base Turso et
    // rattraperont la même échéance au même moment (typiquement le lundi matin après un
    // 1er tombé un samedi). La PRIMARY KEY (type, annee) rend la prise de verrou atomique :
    // le second INSERT échoue sur contrainte, donc un seul poste crédite.
    // Table dédiée : historique_traitements porte un CHECK strict sur 'statut' et n'a pas
    // vocation à héberger des états transitoires. Créée à la demande par son seul
    // consommateur, ce qui garde le module autonome (et testable hors Electron).
    let tableVerrousPrete = false;
    async function assurerTableVerrous() {
        if (tableVerrousPrete) return;
        await ctx.db.execute(`CREATE TABLE IF NOT EXISTS traitements_verrous (
            type TEXT NOT NULL,
            annee INTEGER NOT NULL,
            date_prise TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (type, annee)
        )`);
        tableVerrousPrete = true;
    }

    async function prendreVerrouTraitement(type, annee) {
        // Un traitement enregistré en 'success' ou en 'partial' ne doit jamais être rejoué :
        // un 'partial' a déjà crédité une partie des salariés, les repasser les double-créditerait.
        const dejaFait = await ctx.db.execute({
            sql: `SELECT 1 FROM historique_traitements
                  WHERE type = ? AND annee = ? AND statut IN ('success', 'partial') LIMIT 1`,
            args: [type, annee]
        });
        if (dejaFait.rows[0]) return false;

        try {
            await ctx.db.execute({
                sql: 'INSERT INTO traitements_verrous (type, annee) VALUES (?, ?)',
                args: [type, annee]
            });
            return true;
        } catch (e) {
            const estConflit = (e && e.code === 'SQLITE_CONSTRAINT')
                || /constraint/i.test(String((e && e.message) || ''));
            if (estConflit) return false;   // un autre poste traite déjà cette échéance
            throw e;
        }
    }

    async function libererVerrouTraitement(type, annee) {
        try {
            await ctx.db.execute({
                sql: 'DELETE FROM traitements_verrous WHERE type = ? AND annee = ?',
                args: [type, annee]
            });
        } catch (e) { console.error('Erreur libération verrou traitement:', e); }
    }

    // Un poste qui coupe en plein traitement laisserait un verrou éternel : on purge
    // les verrous plus vieux que VERROU_PERIME_HEURES avant chaque vérification.
    async function purgerVerrousPerimes() {
        try {
            await ctx.db.execute({
                sql: `DELETE FROM traitements_verrous WHERE date_prise < datetime('now', ?)`,
                args: [`-${VERROU_PERIME_HEURES} hours`]
            });
        } catch (e) { console.error('Erreur purge verrous traitements:', e); }
    }

    // Dernier mois d'acquisition effectivement crédité — point de reprise du rattrapage.
    async function getDernierMoisCredite() {
        const result = await ctx.db.execute({
            sql: `SELECT annee, CAST(REPLACE(type, 'CP_MENSUEL_', '') AS INTEGER) AS mois
                  FROM historique_traitements
                  WHERE type LIKE 'CP_MENSUEL_%' AND statut IN ('success', 'partial')
                  ORDER BY annee DESC, mois DESC
                  LIMIT 1`,
            args: []
        });
        const row = result.rows[0];
        if (!row || !row.mois) return null;
        return { annee: Number(row.annee), mois: Number(row.mois) };
    }

    let verificationEnCours = false;

    async function verifierTraitementsAutomatiques() {
        // La vérification tourne au démarrage ET périodiquement : on empêche deux passes
        // concurrentes dans la même instance.
        if (verificationEnCours) return;
        verificationEnCours = true;

        try {
            console.log('Vérification des traitements automatiques...');

            const aujourdhui = new Date();
            const annee = aujourdhui.getFullYear();
            const mois = aujourdhui.getMonth() + 1;

            await assurerTableVerrous();
            await purgerVerrousPerimes();

            const taches = [];

            // --- Traitements CP mensuels échus ---
            // Le mois M est dû le 1er du mois M+1. On empile tous les mois échus depuis
            // le dernier crédité, et pas seulement le mois précédent.
            const dernierCredite = await getDernierMoisCredite();
            const dernierMoisDu = moisPrecedent({ annee, mois });

            // Sans historique (installation neuve, table vidée), on ne crédite rien
            // rétroactivement : on se limite au mois écoulé, comme avant.
            let curseur = dernierCredite ? moisSuivant(dernierCredite) : dernierMoisDu;

            let nbMoisEmpiles = 0;
            while (indexMois(curseur) <= indexMois(dernierMoisDu) && nbMoisEmpiles < RATTRAPAGE_MAX_MOIS) {
                const m = curseur;
                taches.push({
                    echeance: new Date(m.annee, m.mois, 1),   // 1er du mois suivant
                    priorite: 0,                              // avant les annuels de même date
                    type: `CP_MENSUEL_${m.mois}`,
                    annee: m.annee,
                    libelle: `CP mensuel ${MOIS_NOMS[m.mois]} ${m.annee}`,
                    exec: () => executerTraitementCPMensuelAuto(m.annee, m.mois)
                });
                curseur = moisSuivant(m);
                nbMoisEmpiles++;
            }

            if (nbMoisEmpiles >= RATTRAPAGE_MAX_MOIS) {
                console.warn(`Rattrapage CP mensuel plafonné à ${RATTRAPAGE_MAX_MOIS} mois — relancer l'application pour poursuivre.`);
            }

            // --- Traitements annuels échus (basculement CP + RTT) ---
            const configResult = await ctx.db.execute({
                sql: 'SELECT * FROM config_traitements WHERE actif = 1',
                args: []
            });
            const config = configResult.rows;

            for (const conf of config) {
                if (conf.type !== 'CP_ANNUEL' && conf.type !== 'RTT_ANNUEL') continue;

                const echeance = new Date(annee, conf.mois - 1, conf.jour);
                if (echeance > aujourdhui) continue;   // pas encore due cette année

                taches.push({
                    echeance,
                    priorite: 1,   // au 1er juin : créditer mai AVANT de basculer N → N-1
                    type: conf.type,
                    annee,
                    libelle: `${conf.type} ${annee}`,
                    exec: () => conf.type === 'CP_ANNUEL'
                        ? executerTraitementCPAnnuelAuto(annee)
                        : executerTraitementRTTAuto(annee)
                });
            }

            // Ordre chronologique strict : un rattrapage qui enjambe le 1er juin doit
            // créditer mai, puis basculer N → N-1, puis créditer juin.
            taches.sort((a, b) => (a.echeance - b.echeance) || (a.priorite - b.priorite));

            for (const tache of taches) {
                if (!(await prendreVerrouTraitement(tache.type, tache.annee))) {
                    console.log(`Traitement ${tache.libelle} déjà effectué (ou en cours sur un autre poste)`);
                    continue;
                }

                console.log(`Exécution du traitement ${tache.libelle}...`);
                try {
                    await tache.exec();
                } catch (err) {
                    // Un échec isolé (paramètres RTT manquants par exemple) ne doit pas
                    // empêcher les traitements suivants de la file de s'exécuter.
                    console.error(`Échec du traitement ${tache.libelle} :`, err);
                } finally {
                    await libererVerrouTraitement(tache.type, tache.annee);
                }
            }

            await verifierRappelRTT(config, annee, aujourdhui);

        } catch (error) {
            console.error('Erreur vérification traitements:', error);
        } finally {
            verificationEnCours = false;
        }
    }

    // Rappel : les paramètres RTT de l'année suivante doivent être saisis peu après le
    // traitement annuel. Déclenché dès que la date de rappel est dépassée (et non le jour
    // pile) ; la garde anti-doublon de 30 jours en fait un rappel mensuel tant que les
    // paramètres manquent, au lieu d'une unique chance manquable.
    async function verifierRappelRTT(config, annee, aujourdhui) {
        const rttConfig = config.find(c => c.type === 'RTT_ANNUEL');
        if (!rttConfig) return;

        let moisRappel = rttConfig.mois + 1;
        let anneeRappel = annee;
        if (moisRappel > 12) { moisRappel = 1; anneeRappel++; }

        const dateRappel = new Date(anneeRappel, moisRappel - 1, rttConfig.jour);
        if (dateRappel > aujourdhui) return;

        const traitementFaitResult = await ctx.db.execute({
            sql: `SELECT * FROM historique_traitements WHERE type = 'RTT_ANNUEL' AND annee = ? AND statut = 'success'`,
            args: [annee]
        });
        if (!traitementFaitResult.rows[0]) return;

        const rttNextYearResult = await ctx.db.execute({
            sql: 'SELECT id FROM rtt_annuels WHERE annee_debut = ?',
            args: [annee + 1]
        });
        if (rttNextYearResult.rows[0]) return;

        const dejaNotifieResult = await ctx.db.execute({
            sql: `SELECT id FROM notifications WHERE type = 'error' AND titre = 'Paramètres RTT manquants'
                  AND message LIKE '%' || ? || '%' AND date_creation > datetime('now', '-30 days')`,
            args: [String(annee + 1)]
        });
        if (dejaNotifieResult.rows[0]) return;

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
