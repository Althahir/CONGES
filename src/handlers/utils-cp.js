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
    return calculerCPMensuelDetail(salarie, annee, mois, taux, historique, joursFeries).total;
}

/**
 * Variante détaillée de calculerCPMensuel : retourne aussi les segments,
 * jours ouvrés, taux utilisés et état du salarié, pour audit.
 * @returns {{total: number, jourDebut: number, totalJoursOuvres: number, nbJoursMois: number,
 *           segments: Array<{jourDebut: number, jourFin: number, tauxNom: string, tauxValeur: number,
 *                             joursOuvres: number, contribution: number}>,
 *           tauxNormal: number, tauxArret: number, fallbackArretApplique: boolean,
 *           dateEmbauche: string, enArretMaladie: number, dateArretMaladie: string|null,
 *           nbHistoriqueTaux: number}}
 */
function calculerCPMensuelDetail(salarie, annee, mois, taux, historique, joursFeries) {
    const dernierJour = new Date(annee, mois, 0);
    const nbJoursMois = dernierJour.getDate();

    const dateEmbauche = new Date(salarie.date_embauche);

    const baseRetour = {
        total: 0,
        jourDebut: 1,
        totalJoursOuvres: 0,
        nbJoursMois,
        segments: [],
        tauxNormal: taux.normal,
        tauxArret: taux.arret,
        fallbackArretApplique: false,
        dateEmbauche: salarie.date_embauche,
        enArretMaladie: salarie.en_arret_maladie || 0,
        dateArretMaladie: salarie.date_arret_maladie || null,
        nbHistoriqueTaux: (historique || []).length
    };

    // Si le salarié n'est pas encore embauché ce mois-ci
    if (dateEmbauche > dernierJour) return baseRetour;

    // Jour de début effectif dans le mois (gestion pro-rata d'embauche mid-mois)
    let jourDebut = 1;
    if (dateEmbauche.getFullYear() === annee && dateEmbauche.getMonth() + 1 === mois) {
        jourDebut = dateEmbauche.getDate();
    }
    baseRetour.jourDebut = jourDebut;

    // Total jours ouvrés du mois (depuis le jour de début effectif)
    const totalJoursOuvres = compterJoursOuvres(annee, mois, jourDebut, nbJoursMois, joursFeries || []);
    baseRetour.totalJoursOuvres = totalJoursOuvres;
    if (totalJoursOuvres === 0) return baseRetour;

    // Construire les segments de taux pour ce mois
    const segments = [];

    // Déterminer le taux initial au début du mois
    const moisISO = `${annee}-${String(mois).padStart(2, '0')}`;
    const debutMoisISO = `${moisISO}-01`;
    let tauxInitial = 'normal';
    let historiqueAVuAvantMois = false;
    for (const h of historique) {
        if (h.date_effet < debutMoisISO) {
            tauxInitial = h.nouveau_taux;
            historiqueAVuAvantMois = true;
        }
    }
    // Filet de sécurité : si l'historique est silencieux avant le mois mais que
    // le salarié est actuellement marqué en arrêt avec une date d'effet antérieure
    // au début du mois, on considère qu'il démarre le mois au taux arrêt.
    // Couvre les cas où historique_taux n'a pas été alimenté (import, bascule manuelle).
    if (!historiqueAVuAvantMois && salarie.en_arret_maladie && salarie.date_arret_maladie) {
        const dateArret = String(salarie.date_arret_maladie).slice(0, 10);
        if (dateArret <= debutMoisISO) {
            tauxInitial = 'arret';
            baseRetour.fallbackArretApplique = true;
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
    const segmentsDetail = [];
    for (let i = 0; i < segments.length; i++) {
        const segDebut = segments[i].debut;
        const segFin = (i + 1 < segments.length) ? segments[i + 1].debut - 1 : nbJoursMois;
        const joursOuvresSegment = compterJoursOuvres(annee, mois, segDebut, segFin, joursFeries || []);
        const tauxSegment = segments[i].taux === 'arret' ? taux.arret : taux.normal;
        const contribution = tauxSegment * (joursOuvresSegment / totalJoursOuvres);
        cpTotal += contribution;
        segmentsDetail.push({
            jourDebut: segDebut,
            jourFin: segFin,
            tauxNom: segments[i].taux,
            tauxValeur: tauxSegment,
            joursOuvres: joursOuvresSegment,
            contribution: contribution
        });
    }

    baseRetour.total = cpTotal;
    baseRetour.segments = segmentsDetail;
    return baseRetour;
}

/**
 * Récupère les taux globaux depuis la table config_app.
 * @param {Object} db - Turso/libSQL client
 * @returns {Promise<{normal: number, arret: number}>}
 */
async function getTauxGlobaux(db) {
    const result = await db.execute({
        sql: "SELECT cle, valeur FROM config_app WHERE cle IN ('taux_cp_normal', 'taux_cp_arret')",
        args: []
    });
    const config = {};
    (result.rows || []).forEach(r => { config[r.cle] = parseFloat(r.valeur); });
    return {
        normal: config.taux_cp_normal || 2.08333,
        arret: config.taux_cp_arret || 1.66333
    };
}

/**
 * Récupère les jours fériés d'une année depuis la DB.
 * @param {Object} db - Turso/libSQL client
 * @param {number} annee
 * @returns {Promise<string[]>} tableau de dates ISO
 */
async function getJoursFeriesAnnee(db, annee) {
    const result = await db.execute({
        sql: 'SELECT date FROM jours_feries WHERE annee = ?',
        args: [annee]
    });
    return (result.rows || []).map(r => r.date);
}

module.exports = { calculerCPMensuel, calculerCPMensuelDetail, getTauxGlobaux, getJoursFeriesAnnee };
