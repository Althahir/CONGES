const { contextBridge, ipcRenderer } = require('electron');

// ========== SENTRY (renderer) ==========
// Init du SDK renderer. Le bridge IPC vers main est créé automatiquement.
// Nécessite sandbox: false côté webPreferences (sinon require de packages npm bloqué).
let _Sentry = null;
try {
    _Sentry = require('@sentry/electron/renderer');
    _Sentry.init({});
    console.log('[Sentry] renderer init OK');
} catch (e) {
    console.error('[Sentry] renderer init failed:', e && (e.stack || e.message || e));
}

// ========== TYPES JSDoc ==========

/**
 * @typedef {Object} Salarie
 * @property {number} id
 * @property {string} nom
 * @property {string} prenom
 * @property {string} email
 * @property {string} date_embauche
 * @property {string} [type_contrat]
 * @property {number} cp_mensuel
 * @property {number} a_droit_rtt - 0 ou 1
 * @property {number} a_droit_recup - 0 ou 1
 * @property {number} actif - 0 ou 1
 * @property {string} role - 'admin' | 'utilisateur'
 * @property {number} [premiere_connexion] - 0 ou 1
 */

/**
 * @typedef {Object} Soldes
 * @property {number} id
 * @property {number} salarie_id
 * @property {number} annee
 * @property {number} cp_n
 * @property {number} cp_n1
 * @property {number} rtt
 * @property {number} recup_heures
 */

/**
 * @typedef {Object} Absence
 * @property {number} id
 * @property {number} salarie_id
 * @property {string} type - 'CP' | 'RTT' | 'RECUP' | 'MALADIE'
 * @property {string} date_debut - format YYYY-MM-DD
 * @property {string} date_fin - format YYYY-MM-DD
 * @property {number} duree_jours
 * @property {number} [duree_heures]
 * @property {string} statut - 'valide' | 'en_attente' | 'refuse'
 * @property {string} [commentaire]
 * @property {string} [date_creation]
 * @property {string} [debut_periode] - 'journee-complete' | 'apres-midi'
 * @property {string} [fin_periode] - 'journee-complete' | 'midi'
 * @property {string} [motif_refus]
 * @property {string} [date_validation]
 * @property {number} [validee_par]
 */

/**
 * @typedef {Object} AbsenceAvecSalarie
 * @property {number} id
 * @property {number} salarie_id
 * @property {string} type
 * @property {string} date_debut
 * @property {string} date_fin
 * @property {number} duree_jours
 * @property {number} [duree_heures]
 * @property {string} statut
 * @property {string} [commentaire]
 * @property {string} nom
 * @property {string} prenom
 */

/**
 * @typedef {Object} JourFerie
 * @property {number} id
 * @property {string} date - format YYYY-MM-DD
 * @property {string} libelle
 * @property {number} annee
 */

/**
 * @typedef {Object} RTTAnnuel
 * @property {number} [id]
 * @property {number} annee_debut
 * @property {string} [date_debut]
 * @property {string} [date_fin]
 * @property {number} nb_jours_travailles
 * @property {number} nb_cp_a_deduire
 * @property {number} [nb_jours_periode]
 * @property {number} [nb_jours_we]
 * @property {number} [nb_jours_feries_hors_we]
 * @property {number} [nb_rtt]
 */

/**
 * @typedef {Object} ConfigTraitement
 * @property {number} id
 * @property {string} type - 'CP' | 'RTT'
 * @property {number} jour
 * @property {number} mois
 */

/**
 * @typedef {Object} HistoriqueTraitement
 * @property {number} id
 * @property {string} type
 * @property {number} annee
 * @property {string} date_execution
 * @property {number} nb_salaries_traites
 * @property {string} [details]
 * @property {string} statut
 * @property {string} [message_erreur]
 */

/**
 * @typedef {Object} Notification
 * @property {number} id
 * @property {string} type
 * @property {string} titre
 * @property {string} message
 * @property {string} date_creation
 * @property {string} statut
 */

/**
 * @typedef {Object} HeureSup
 * @property {number} id
 * @property {number} salarie_id
 * @property {string} date
 * @property {number} heures
 * @property {string} [commentaire]
 * @property {string} date_creation
 */

/**
 * @typedef {Object} LoginResult
 * @property {boolean} success
 * @property {string} [message]
 * @property {boolean} [firstLogin]
 * @property {{id: number, nom: string, prenom: string, email: string, role: string}} [user]
 */

/**
 * @typedef {Object} DureeResult
 * @property {number} joursOuvres
 * @property {number} dureeJours
 * @property {number} joursFeries
 */

/**
 * @typedef {Object} SuccessResult
 * @property {boolean} success
 * @property {number} [id]
 */

/**
 * @typedef {Object} TraitementResult
 * @property {boolean} success
 * @property {number} [nbMisAJour]
 * @property {string[]} [details]
 * @property {string[]} [erreurs]
 * @property {string} [message]
 */

/**
 * @typedef {Object} SoldesUpdateResult
 * @property {boolean} success
 * @property {number} [cp_n]
 * @property {number} [cp_n1]
 * @property {number} [rtt]
 * @property {number} [recup_heures]
 */

// ========== API EXPOSEE AU RENDERER ==========

// Expose des fonctions securisees au frontend
contextBridge.exposeInMainWorld('api', {
    // Authentification

    /** @param {string} email @param {string} password @returns {Promise<LoginResult>} */
    login: (email, password) => ipcRenderer.invoke('login', email, password),
    /** @returns {Promise<void>} */
    logout: () => ipcRenderer.invoke('logout'),
    /** @param {number} userId @returns {Promise<{premiere_connexion: number}>} */
    checkFirstLogin: (userId) => ipcRenderer.invoke('checkFirstLogin', userId),
    /** @param {number} userId @param {string} password @returns {Promise<SuccessResult>} */
    setPassword: (userId, password) => ipcRenderer.invoke('setPassword', userId, password),

    // Mots de passe mémorisés sur le poste (chiffrés via safeStorage)
    /** @param {string} email @param {string} password @returns {Promise<SuccessResult>} */
    saveCredential: (email, password) => ipcRenderer.invoke('saveCredential', email, password),
    /** @param {string} email @returns {Promise<string|null>} Mot de passe en clair si mémorisé, sinon null */
    getCredential: (email) => ipcRenderer.invoke('getCredential', email),
    /** @param {string} email @returns {Promise<SuccessResult>} */
    deleteCredential: (email) => ipcRenderer.invoke('deleteCredential', email),
    /** @param {string} email @returns {Promise<boolean>} */
    hasCredential: (email) => ipcRenderer.invoke('hasCredential', email),

    // Gestion des salaries

    /** @param {number} id @returns {Promise<Salarie>} */
    getSalarie: (id) => ipcRenderer.invoke('getSalarie', id),
    /** @returns {Promise<Salarie[]>} */
    getAllSalaries: () => ipcRenderer.invoke('getAllSalaries'),
    /** @param {{nom: string, prenom: string, email: string, date_embauche: string, type_contrat?: string, cp_mensuel: number, a_droit_rtt: number, a_droit_recup: number}} data @returns {Promise<SuccessResult>} */
    createSalarie: (data) => ipcRenderer.invoke('createSalarie', data),
    /** @param {number} id @param {{nom: string, prenom: string, email: string, date_embauche: string, type_contrat?: string, cp_mensuel: number, a_droit_rtt: number, a_droit_recup: number}} data @returns {Promise<SuccessResult>} */
    updateSalarie: (id, data) => ipcRenderer.invoke('updateSalarie', id, data),
    /** @param {number} id @returns {Promise<SuccessResult>} */
    deactivateSalarie: (id) => ipcRenderer.invoke('deactivateSalarie', id),
    /** @param {number} id @returns {Promise<SuccessResult>} */
    resetPassword: (id) => ipcRenderer.invoke('resetPassword', id),

    // Gestion des soldes

    /** @param {number} salarieId @param {number} annee @returns {Promise<Soldes|null>} */
    getSoldes: (salarieId, annee) => ipcRenderer.invoke('getSoldes', salarieId, annee),
    /** @param {number} salarieId @param {number} annee @param {{cp_n: number, cp_n1: number, rtt: number, recup_heures: number}} soldes @returns {Promise<SuccessResult>} */
    updateSoldes: (salarieId, annee, soldes) => ipcRenderer.invoke('updateSoldes', salarieId, annee, soldes),
    /** @param {number} salarieId @param {number} annee @param {string} type @param {number} dureeJours @param {number} dureeHeures @param {number} [absenceId] @returns {Promise<SoldesUpdateResult>} */
    updateSoldesAfterAbsence: (salarieId, annee, type, dureeJours, dureeHeures, absenceId) => ipcRenderer.invoke('updateSoldesAfterAbsence', salarieId, annee, type, dureeJours, dureeHeures, absenceId),
    /** @param {{salarie_id: number, annee: number, heures: number, date: string, commentaire?: string}} data @returns {Promise<SuccessResult>} */
    ajouterRecup: (data) => ipcRenderer.invoke('ajouter-recup', data),
    /** @param {number} salarieId @returns {Promise<HeureSup[]>} */
    getHeuresSup: (salarieId) => ipcRenderer.invoke('getHeuresSup', salarieId),
    /** @returns {Promise<HeureSup[]>} Toutes les saisies hsup (calendrier global) */
    getAllHeuresSup: () => ipcRenderer.invoke('getAllHeuresSup'),
    /** @param {number} salarieId @returns {Promise<Array>} Liste fusionnée heures_supplementaires + absences RECUP (lecture seule) */
    getHistoriqueRecupComplet: (salarieId) => ipcRenderer.invoke('getHistoriqueRecupComplet', salarieId),
    /** @param {{id: number, date: string, heures: number, commentaire?: string, actorId?: number}} payload @returns {Promise<SuccessResult>} */
    updateHeureSup: (payload) => ipcRenderer.invoke('updateHeureSup', payload),
    /** @param {number|{id: number, actorId?: number}} idOrPayload @returns {Promise<SuccessResult>} */
    deleteHeureSup: (idOrPayload) => ipcRenderer.invoke('deleteHeureSup', idOrPayload),
    /** @returns {Promise<Array>} Liste des demandes de récup en attente (admin) */
    getHeuresSupEnAttente: () => ipcRenderer.invoke('getHeuresSupEnAttente'),
    /** @param {{id: number, adminId: number}} payload @returns {Promise<SuccessResult>} */
    validerHeureSup: (payload) => ipcRenderer.invoke('validerHeureSup', payload),
    /** @param {{id: number, adminId: number}} payload @returns {Promise<SuccessResult>} */
    refuserHeureSup: (payload) => ipcRenderer.invoke('refuserHeureSup', payload),

    // Gestion des absences

    /** @param {{salarie_id: number, type: string, date_debut: string, date_fin: string, duree_jours: number, duree_heures?: number, commentaire?: string, debut_periode?: string, fin_periode?: string, skipNotification?: boolean, autoValide?: boolean}} data @returns {Promise<{success: boolean, id: number, statut: 'valide'|'en_attente'}>} */
    createAbsence: (data) => ipcRenderer.invoke('createAbsence', data),
    /** @param {number} salarieId @returns {Promise<Absence[]>} */
    getAbsences: (salarieId) => ipcRenderer.invoke('getAbsences', salarieId),
    /** @returns {Promise<AbsenceAvecSalarie[]>} */
    getAllAbsences: () => ipcRenderer.invoke('getAllAbsences'),
    /** @returns {Promise<AbsenceAvecSalarie[]>} */
    getAbsencesEnAttente: () => ipcRenderer.invoke('getAbsencesEnAttente'),
    /** @param {number} salarieId @param {number} annee @returns {Promise<{cp: number, rtt: number, recup_heures: number}>} */
    getEnAttenteParSalarie: (salarieId, annee) => ipcRenderer.invoke('getEnAttenteParSalarie', salarieId, annee),
    /** @param {number} absenceId @param {number} adminId @returns {Promise<SuccessResult>} */
    validerAbsence: (absenceId, adminId) => ipcRenderer.invoke('validerAbsence', absenceId, adminId),
    /** @param {number} absenceId @param {number} adminId @returns {Promise<SuccessResult>} */
    refuserAbsence: (absenceId, adminId, motif) => ipcRenderer.invoke('refuserAbsence', absenceId, adminId, motif),
    /** @param {number} absenceId @param {Object} [options] @param {boolean} [options.skipRecredit] @param {number} [options.adminId] @returns {Promise<SuccessResult>} */
    deleteAbsence: (absenceId, options) => ipcRenderer.invoke('deleteAbsence', absenceId, options),
    /** @param {number} absenceId @param {Object} updates @returns {Promise<SuccessResult>} */
    updateAbsence: (absenceId, updates) => ipcRenderer.invoke('updateAbsence', absenceId, updates),
    /** Recrédit CP après deleteAbsence skipRecredit (modale 2 de réaffectation) */
    appliquerRecreditCp: (salarieId, annee, recreditCpN1, recreditCpN) => ipcRenderer.invoke('appliquerRecreditCp', salarieId, annee, recreditCpN1, recreditCpN),
    /** Met à jour la décomposition CP_N-1 / CP_N d'une absence existante */
    setDecompositionAbsence: (absenceId, debiteCpN1, debiteCpN) => ipcRenderer.invoke('setDecompositionAbsence', absenceId, debiteCpN1, debiteCpN),

    // Jours feries

    /** @param {number} annee @returns {Promise<JourFerie[]>} */
    getJoursFeries: (annee) => ipcRenderer.invoke('getJoursFeries', annee),
    /** @param {{date: string, libelle: string, annee: number}} data @returns {Promise<SuccessResult>} */
    addJourFerie: (data) => ipcRenderer.invoke('addJourFerie', data),
    /** @param {number} id @returns {Promise<SuccessResult>} */
    deleteJourFerie: (id) => ipcRenderer.invoke('deleteJourFerie', id),

    // RTT annuels

    /** @returns {Promise<RTTAnnuel[]>} */
    getRTTAnnuels: () => ipcRenderer.invoke('getRTTAnnuels'),
    /** @param {RTTAnnuel} data @returns {Promise<SuccessResult>} */
    addRTTAnnuel: (data) => ipcRenderer.invoke('addRTTAnnuel', data),

    // Calcul de duree

    /** @param {string} dateDebut - format YYYY-MM-DD @param {string} dateFin - format YYYY-MM-DD @param {string} [debutPeriode] - 'journee-complete' | 'apres-midi' @param {string} [finPeriode] - 'journee-complete' | 'midi' @returns {Promise<DureeResult>} */
    calculerDuree: (dateDebut, dateFin, debutPeriode, finPeriode) => ipcRenderer.invoke('calculerDuree', dateDebut, dateFin, debutPeriode, finPeriode),

    // PDF

    /** @param {Object} absenceData @returns {Promise<SuccessResult>} */
    genererPDF: (absenceData) => ipcRenderer.invoke('genererPDF', absenceData),
    /** @param {{salarie_id: number, annee: number}} data @returns {Promise<SuccessResult>} */
    exporterRecapPDF: (data) => ipcRenderer.invoke('exporterRecapPDF', data),
    exporterStatsPDF: (data) => ipcRenderer.invoke('exporterStatsPDF', data),

    // Gestion des traitements automatiques

    /** @returns {Promise<ConfigTraitement[]>} */
    getConfigTraitements: () => ipcRenderer.invoke('getConfigTraitements'),
    /** @param {string} type @param {number} jour @param {number} mois @returns {Promise<SuccessResult>} */
    updateConfigTraitement: (type, jour, mois) => ipcRenderer.invoke('updateConfigTraitement', type, jour, mois),
    /** @param {{type: string, annee: number, nb_salaries_traites?: number, details?: string, statut: string, message_erreur?: string}} data @returns {Promise<SuccessResult>} */
    logHistoriqueTraitement: (data) => ipcRenderer.invoke('logHistoriqueTraitement', data),
    /** @returns {Promise<HistoriqueTraitement[]>} */
    getHistoriqueTraitements: () => ipcRenderer.invoke('getHistoriqueTraitements'),
    /** @param {number} annee @returns {Promise<TraitementResult>} */
    executerTraitementCP: (annee) => ipcRenderer.invoke('executerTraitementCP', annee),
    /** @param {number} annee @param {number} mois @returns {Promise<TraitementResult>} */
    executerTraitementCPMensuel: (annee, mois) => ipcRenderer.invoke('executerTraitementCPMensuel', annee, mois),
    /** @param {number} annee @returns {Promise<TraitementResult>} */
    executerTraitementRTT: (annee) => ipcRenderer.invoke('executerTraitementRTT', annee),

    // Gestion des notifications persistantes

    /** @param {number} userId @returns {Promise<Notification[]>} */
    getNotificationsNonLues: (userId) => ipcRenderer.invoke('getNotificationsNonLues', userId),
    /** @param {number} notificationId @returns {Promise<SuccessResult>} */
    marquerNotificationLue: (notificationId) => ipcRenderer.invoke('marquerNotificationLue', notificationId),
    /** @param {{type: string, titre: string, message: string, statut?: string}} notificationData @returns {Promise<SuccessResult>} */
    creerNotification: (notificationData) => ipcRenderer.invoke('creerNotification', notificationData),

    // Ecouter les notifications de traitements automatiques

    /** @param {function(Object): void} callback @returns {void} */
    onTraitementAutomatique: (callback) => {
        ipcRenderer.on('traitement-automatique', (event, data) => callback(data));
    },

    // Configuration applicative (taux CP)

    /** @returns {Promise<{taux_cp_normal: string, taux_cp_arret: string}>} */
    getConfigApp: () => ipcRenderer.invoke('getConfigApp'),
    /** @param {string} cle @param {string} valeur @returns {Promise<SuccessResult>} */
    updateConfigApp: (cle, valeur) => ipcRenderer.invoke('updateConfigApp', cle, valeur),
    /** @param {number} salarieId @returns {Promise<Array>} */
    getHistoriqueTaux: (salarieId) => ipcRenderer.invoke('getHistoriqueTaux', salarieId),

    // Navigation

    /** @param {string} page - nom du fichier HTML (ex: 'dashboard-admin.html') @returns {Promise<SuccessResult>} */
    navigateTo: (page) => ipcRenderer.invoke('navigateTo', page),

    // DB admin (easter egg Ctrl+DEBUG)

    /** @returns {Promise<Array<{name: string, rowCount: number}>>} */
    dbListTables: () => ipcRenderer.invoke('db-list-tables'),
    /** @param {string} name @param {number} [limit] @param {number} [offset] @returns {Promise<{columns: Array, primaryKey: string|null, totalCount: number, rows: Array}>} */
    dbGetTable: (name, limit, offset) => ipcRenderer.invoke('db-get-table', name, limit, offset),
    /** @param {string} table @param {string} pkName @param {*} pkValue @param {string} column @param {*} newValue @returns {Promise<SuccessResult>} */
    dbUpdateCell: (table, pkName, pkValue, column, newValue) => ipcRenderer.invoke('db-update-cell', table, pkName, pkValue, column, newValue),
    /** @param {string} table @param {string} pkName @param {*} pkValue @returns {Promise<{success: boolean, rowsAffected: number}>} */
    dbDeleteRow: (table, pkName, pkValue) => ipcRenderer.invoke('db-delete-row', table, pkName, pkValue),
    /** @param {string} table @param {Object} values @returns {Promise<{success: boolean, id: number}>} */
    dbInsertRow: (table, values) => ipcRenderer.invoke('db-insert-row', table, values),
    /** @param {string} sql @returns {Promise<{success: boolean, rows: Array, columns: Array, rowsAffected: number}>} */
    dbExecRaw: (sql) => ipcRenderer.invoke('db-exec-raw', sql),

    /** @returns {Promise<string>} version de l'app (ex: '1.0.1') */
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),

    /** @returns {Promise<boolean>} true si lancé en dev (npm start), false en prod (installeur) */
    getIsDev: () => ipcRenderer.invoke('getIsDev'),

    /** @param {(data: {version: string}) => void} callback - appelé quand une mise à jour a été téléchargée */
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, data) => callback(data)),

    /** @returns {Promise<void>} ferme l'app et applique la mise à jour téléchargée */
    applyUpdate: () => ipcRenderer.invoke('applyUpdate')
});
