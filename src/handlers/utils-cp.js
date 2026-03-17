/**
 * Compte les jours ouvrés (lundi-vendredi, hors fériés) entre 2 jours d'un mois.
 * @param {number} annee
 * @param {number} mois - 1-12
 * @param {number} jourDebut - jour du mois (1-31)
 * @param {number} jourFin - jour du mois (1-31)
 * @param {string[]} joursFeries - dates ISO (YYYY-MM-DD) des jours fériés
 * @returns {number}
 */
function compterJoursOuvres(annee, mois, jourDebut, jourFin, joursFeries) {
    let count = 0;
    for (let j = jourDebut; j <= jourFin; j++) {
        const date = new Date(annee, mois - 1, j);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue; // weekend
        const iso = `${annee}-${String(mois).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
        if (joursFeries.includes(iso)) continue; // férié
        count++;
    }
    return count;
}

/**
 * Calcule le CP à ajouter pour un salarié sur un mois donné.
 * Calcul au prorata des jours ouvrés (hors weekends et fériés).
 *
 * @param {Object} salarie - le salarié (avec date_embauche)
 * @param {number} annee
 * @param {number} mois - 1-12
 * @param {Object} taux - { normal, arret }
 * @param {Array} historique - historique_taux du salarié, trié par date_effet ASC
 * @param {string[]} joursFeries - dates ISO des jours fériés du mois/année
 * @returns {number} CP à ajouter
 */
function calculerCPMensuel(salarie, annee, mois, taux, historique, joursFeries) {
    const dernierJour = new Date(annee, mois, 0);
    const nbJoursMois = dernierJour.getDate();

    const dateEmbauche = new Date(salarie.date_embauche);

    // Si le salarié n'est pas encore embauché ce mois-ci
    if (dateEmbauche > dernierJour) return 0;

    // Jour de début effectif dans le mois
    let jourDebut = 1;
    if (dateEmbauche.getFullYear() === annee && dateEmbauche.getMonth() + 1 === mois) {
        jourDebut = dateEmbauche.getDate();
    }

    // Total jours ouvrés du mois (depuis le jour de début effectif)
    const totalJoursOuvres = compterJoursOuvres(annee, mois, jourDebut, nbJoursMois, joursFeries || []);
    if (totalJoursOuvres === 0) return 0;

    // Construire les segments de taux pour ce mois
    const segments = [];

    // Déterminer le taux initial au début du mois
    const moisISO = `${annee}-${String(mois).padStart(2, '0')}`;
    let tauxInitial = 'normal';
    for (const h of historique) {
        if (h.date_effet < `${moisISO}-01`) {
            tauxInitial = h.nouveau_taux;
        }
    }

    segments.push({ debut: jourDebut, taux: tauxInitial });

    // Ajouter les changements de taux QUI TOMBENT dans ce mois
    for (const h of historique) {
        const dateEffet = new Date(h.date_effet);
        if (dateEffet.getFullYear() === annee && dateEffet.getMonth() + 1 === mois) {
            const jourEffet = dateEffet.getDate();
            if (jourEffet > jourDebut) {
                segments.push({ debut: jourEffet, taux: h.nouveau_taux });
            }
        }
    }

    // Calculer le prorata en jours ouvrés pour chaque segment
    let cpTotal = 0;
    for (let i = 0; i < segments.length; i++) {
        const segDebut = segments[i].debut;
        const segFin = (i + 1 < segments.length) ? segments[i + 1].debut - 1 : nbJoursMois;
        const joursOuvresSegment = compterJoursOuvres(annee, mois, segDebut, segFin, joursFeries || []);
        const tauxSegment = segments[i].taux === 'arret' ? taux.arret : taux.normal;
        cpTotal += tauxSegment * (joursOuvresSegment / totalJoursOuvres);
    }

    return cpTotal;
}

/**
 * Récupère les taux globaux depuis la table config_app.
 * @param {Object} db - instance SQLite
 * @returns {Promise<{normal: number, arret: number}>}
 */
function getTauxGlobaux(db) {
    return new Promise((resolve, reject) => {
        db.all('SELECT cle, valeur FROM config_app WHERE cle IN ("taux_cp_normal", "taux_cp_arret")', (err, rows) => {
            if (err) { reject(err); return; }
            const config = {};
            (rows || []).forEach(r => { config[r.cle] = parseFloat(r.valeur); });
            resolve({
                normal: config.taux_cp_normal || 2.08333,
                arret: config.taux_cp_arret || 1.66333
            });
        });
    });
}

/**
 * Récupère les jours fériés d'une année depuis la DB.
 * @param {Object} db - instance SQLite
 * @param {number} annee
 * @returns {Promise<string[]>} tableau de dates ISO
 */
function getJoursFeriesAnnee(db, annee) {
    return new Promise((resolve, reject) => {
        db.all('SELECT date FROM jours_feries WHERE annee = ?', [annee], (err, rows) => {
            if (err) { reject(err); return; }
            resolve((rows || []).map(r => r.date));
        });
    });
}

module.exports = { calculerCPMensuel, getTauxGlobaux, getJoursFeriesAnnee };
