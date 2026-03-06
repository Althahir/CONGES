const { contextBridge, ipcRenderer } = require('electron');

// Expose des fonctions sécurisées au frontend
contextBridge.exposeInMainWorld('api', {
    // Authentification
    login: (email, password) => ipcRenderer.invoke('login', email, password),
    logout: () => ipcRenderer.invoke('logout'),
    checkFirstLogin: (userId) => ipcRenderer.invoke('checkFirstLogin', userId),
    setPassword: (userId, password) => ipcRenderer.invoke('setPassword', userId, password),
    
    // Gestion des salariés
    getSalarie: (id) => ipcRenderer.invoke('getSalarie', id),
    getAllSalaries: () => ipcRenderer.invoke('getAllSalaries'),
    createSalarie: (data) => ipcRenderer.invoke('createSalarie', data),
    updateSalarie: (id, data) => ipcRenderer.invoke('updateSalarie', id, data),
    deactivateSalarie: (id) => ipcRenderer.invoke('deactivateSalarie', id),
    resetPassword: (id) => ipcRenderer.invoke('resetPassword', id),
    
    // Gestion des soldes
    getSoldes: (salarieId, annee) => ipcRenderer.invoke('getSoldes', salarieId, annee),
    updateSoldes: (salarieId, annee, soldes) => ipcRenderer.invoke('updateSoldes', salarieId, annee, soldes),
    updateSoldesAfterAbsence: (salarieId, annee, type, dureeJours, dureeHeures) => ipcRenderer.invoke('updateSoldesAfterAbsence', salarieId, annee, type, dureeJours, dureeHeures),
    ajouterRecup: (data) => ipcRenderer.invoke('ajouter-recup', data),
    
    // Gestion des absences
    createAbsence: (data) => ipcRenderer.invoke('createAbsence', data),
    getAbsences: (salarieId) => ipcRenderer.invoke('getAbsences', salarieId),
    getAllAbsences: () => ipcRenderer.invoke('getAllAbsences'),
    deleteAbsence: (absenceId) => ipcRenderer.invoke('deleteAbsence', absenceId),
    updateAbsence: (absenceId, updates) => ipcRenderer.invoke('updateAbsence', absenceId, updates),
    // Jours fériés
    getJoursFeries: (annee) => ipcRenderer.invoke('getJoursFeries', annee),
    addJourFerie: (data) => ipcRenderer.invoke('addJourFerie', data),
    deleteJourFerie: (id) => ipcRenderer.invoke('deleteJourFerie', id),
    
    // RTT annuels
    getRTTAnnuels: () => ipcRenderer.invoke('getRTTAnnuels'),
    addRTTAnnuel: (data) => ipcRenderer.invoke('addRTTAnnuel', data),

    // Calcul de durée
    calculerDuree: (dateDebut, dateFin, debutPeriode, finPeriode) => ipcRenderer.invoke('calculerDuree', dateDebut, dateFin, debutPeriode, finPeriode),

    // PDF
    genererPDF: (absenceData) => ipcRenderer.invoke('genererPDF', absenceData),

    // Gestion des traitements automatiques
    getConfigTraitements: () => ipcRenderer.invoke('getConfigTraitements'),
    updateConfigTraitement: (type, jour, mois) => ipcRenderer.invoke('updateConfigTraitement', type, jour, mois),
    getHistoriqueTraitements: () => ipcRenderer.invoke('getHistoriqueTraitements'),
    executerTraitementCP: (annee) => ipcRenderer.invoke('executerTraitementCP', annee),
    executerTraitementRTT: (annee) => ipcRenderer.invoke('executerTraitementRTT', annee),
    
    // Gestion des notifications persistantes
    getNotificationsNonLues: (userId) => ipcRenderer.invoke('getNotificationsNonLues', userId),
    marquerNotificationLue: (notificationId) => ipcRenderer.invoke('marquerNotificationLue', notificationId),
    creerNotification: (notificationData) => ipcRenderer.invoke('creerNotification', notificationData),

    // Écouter les notifications de traitements automatiques
    onTraitementAutomatique: (callback) => {
        ipcRenderer.on('traitement-automatique', (event, data) => callback(data));
    },
    
    // Navigation
    navigateTo: (page) => ipcRenderer.invoke('navigateTo', page)
});