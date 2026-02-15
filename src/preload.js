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
    
    // Gestion des soldes
    getSoldes: (salarieId, annee) => ipcRenderer.invoke('getSoldes', salarieId, annee),
    updateSoldes: (salarieId, annee, soldes) => ipcRenderer.invoke('updateSoldes', salarieId, annee, soldes),
    
    // Gestion des absences
    createAbsence: (data) => ipcRenderer.invoke('createAbsence', data),
    getAbsences: (salarieId) => ipcRenderer.invoke('getAbsences', salarieId),
    getAllAbsences: () => ipcRenderer.invoke('getAllAbsences'),
    deleteAbsence: (id) => ipcRenderer.invoke('deleteAbsence', id),
    
    // Jours fériés
    getJoursFeries: (annee) => ipcRenderer.invoke('getJoursFeries', annee),
    addJourFerie: (data) => ipcRenderer.invoke('addJourFerie', data),
    
    // RTT annuels
    getRTTAnnuels: () => ipcRenderer.invoke('getRTTAnnuels'),
    addRTTAnnuel: (data) => ipcRenderer.invoke('addRTTAnnuel', data),

    // Calcul de durée
    calculerDuree: (dateDebut, dateFin, periodeType) => ipcRenderer.invoke('calculerDuree', dateDebut, dateFin, periodeType),

    // Navigation
    navigateTo: (page) => ipcRenderer.invoke('navigateTo', page),
    
    // Création et mise à jour
    createAbsence: (absenceData) => ipcRenderer.invoke('createAbsence', absenceData),
    updateSoldesAfterAbsence: (salarieId, annee, type, dureeJours, dureeHeures) => ipcRenderer.invoke('updateSoldesAfterAbsence', salarieId, annee, type, dureeJours, dureeHeures),
    
    // Navigation
    navigateTo: (page) => ipcRenderer.invoke('navigateTo', page),

    // Création et mise à jour
    createAbsence: (absenceData) => ipcRenderer.invoke('createAbsence', absenceData),
    updateSoldesAfterAbsence: (salarieId, annee, type, dureeJours, dureeHeures) => ipcRenderer.invoke('updateSoldesAfterAbsence', salarieId, annee, type, dureeJours, dureeHeures),
    genererPDF: (absenceData) => ipcRenderer.invoke('genererPDF', absenceData),
    
});