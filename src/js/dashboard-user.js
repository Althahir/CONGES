// Récupérer les infos utilisateur
const user = JSON.parse(sessionStorage.getItem('user'));

// Si pas d'utilisateur ou si admin, rediriger
if (!user) {
    window.location.href = 'login.html';
} else if (user.role === 'admin') {
    window.location.href = 'dashboard-admin.html';
}

// Afficher le nom de l'utilisateur
document.getElementById('userName').textContent = `${user.prenom} ${user.nom}`;

// Variables globales
let anneeActuelle = new Date().getFullYear();
let joursFeries = [];
let absences = [];

// ========== GESTION DE L'ANNÉE ==========

document.getElementById('anneeActuelle').textContent = anneeActuelle;

document.getElementById('btnPrevYear').addEventListener('click', () => {
    anneeActuelle--;
    document.getElementById('anneeActuelle').textContent = anneeActuelle;
    chargerCalendrier();
});

document.getElementById('btnNextYear').addEventListener('click', () => {
    anneeActuelle++;
    document.getElementById('anneeActuelle').textContent = anneeActuelle;
    chargerCalendrier();
});

// ========== CHARGEMENT DES DONNÉES ==========

async function loadSoldes() {
    try {
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        if (soldes) {
            document.getElementById('solde-cp-n1').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n').textContent = soldes.cp_n.toFixed(2) + 'j';
            document.getElementById('solde-rtt').textContent = soldes.rtt.toFixed(2) + 'j';
            
            const recupJours = Math.floor(soldes.recup_heures / 7);
            const recupHeuresRestantes = (soldes.recup_heures % 7).toFixed(1);
            document.getElementById('solde-recup').innerHTML = 
                `${soldes.recup_heures.toFixed(1)}h<br><small style="font-size: 0.7em;">(${recupJours}j ${recupHeuresRestantes}h)</small>`;
        } else {
            // Créer les soldes si ils n'existent pas
            await window.api.updateSoldes(user.id, anneeActuelle, {
                cp_n: 0,
                cp_n1: 0,
                rtt: 0,
                recup_heures: 0
            });
            loadSoldes();
        }
    } catch (error) {
        console.error('Erreur lors du chargement des soldes:', error);
    }
}

async function chargerJoursFeries() {
    try {
        joursFeries = await window.api.getJoursFeries(anneeActuelle);
    } catch (error) {
        console.error('Erreur lors du chargement des jours fériés:', error);
        joursFeries = [];
    }
}

async function chargerAbsences() {
    try {
        absences = await window.api.getAbsences(user.id);
        // Filtrer pour l'année actuelle
        absences = absences.filter(abs => {
            const annee = new Date(abs.date_debut).getFullYear();
            return annee === anneeActuelle;
        });
    } catch (error) {
        console.error('Erreur lors du chargement des absences:', error);
        absences = [];
    }
}

// ========== GÉNÉRATION DU CALENDRIER ==========

function genererCalendrier() {
    const calendrierContainer = document.getElementById('calendrierAnnuel');
    calendrierContainer.innerHTML = '';
    
    const nomsJoursCourts = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    // Générer les 12 mois
    for (let mois = 0; mois < 12; mois++) {
        const moisDiv = document.createElement('div');
        moisDiv.className = 'mois-calendrier';
        
        // Header du mois
        const headerDiv = document.createElement('div');
        headerDiv.className = 'mois-header';
        headerDiv.textContent = nomsMois[mois];
        moisDiv.appendChild(headerDiv);
        
        // Jours de la semaine
        const joursSemaineDiv = document.createElement('div');
        joursSemaineDiv.className = 'jours-semaine';
        nomsJoursCourts.forEach(jour => {
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour-semaine';
            jourDiv.textContent = jour;
            joursSemaineDiv.appendChild(jourDiv);
        });
        moisDiv.appendChild(joursSemaineDiv);
        
        // Jours du mois
        const joursMoisDiv = document.createElement('div');
        joursMoisDiv.className = 'jours-mois';
        
        // Premier jour du mois et nombre de jours
        const premierJour = new Date(anneeActuelle, mois, 1);
        const dernierJour = new Date(anneeActuelle, mois + 1, 0);
        const nbJours = dernierJour.getDate();
        const premierJourSemaine = premierJour.getDay();
        
        // Jours vides avant le début du mois
        for (let i = 0; i < premierJourSemaine; i++) {
            const jourVide = document.createElement('div');
            jourVide.className = 'jour vide';
            joursMoisDiv.appendChild(jourVide);
        }
        
        // Jours du mois
        for (let jour = 1; jour <= nbJours; jour++) {
            const date = new Date(anneeActuelle, mois, jour);
            const dateISO = date.toISOString().split('T')[0];
            const dayOfWeek = date.getDay();
            
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour';
            jourDiv.textContent = jour;
            
            // Weekend
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                jourDiv.classList.add('weekend');
            }
            
            // Jour férié
            const estFerie = joursFeries.some(f => f.date === dateISO);
            if (estFerie) {
                jourDiv.classList.add('ferie');
            }
            
            // Absence
            const absence = absences.find(abs => {
                const debut = new Date(abs.date_debut);
                const fin = new Date(abs.date_fin);
                return date >= debut && date <= fin;
            });
            
            if (absence) {
                if (absence.type === 'CP' || absence.type === 'CP_N' || absence.type === 'CP_N1') {
                    jourDiv.classList.add('cp');
                } else if (absence.type === 'RTT') {
                    jourDiv.classList.add('rtt');
                } else if (absence.type === 'RECUP') {
                    jourDiv.classList.add('recup');
                } else if (absence.type === 'MALADIE') {
                    jourDiv.classList.add('maladie');
                }
            }
            
            joursMoisDiv.appendChild(jourDiv);
        }
        
        moisDiv.appendChild(joursMoisDiv);
        calendrierContainer.appendChild(moisDiv);
    }
}

async function chargerCalendrier() {
    await chargerJoursFeries();
    await chargerAbsences();
    genererCalendrier();
}

// ========== GESTION DU FORMULAIRE D'ABSENCE ==========

async function initFormAbsence() {
    try {
        const salarie = await window.api.getSalarie(user.id);
        const typeAbsenceSelect = document.getElementById('typeAbsence');
        
        // Ajouter RTT si le salarié y a droit
        if (salarie.a_droit_rtt === 1) {
            const optionRTT = document.createElement('option');
            optionRTT.value = 'RTT';
            optionRTT.textContent = 'RTT';
            typeAbsenceSelect.insertBefore(optionRTT, typeAbsenceSelect.lastElementChild);
        }
        
        // Ajouter Récup si le salarié y a droit
        if (salarie.a_droit_recup === 1) {
            const optionRecup = document.createElement('option');
            optionRecup.value = 'RECUP';
            optionRecup.textContent = 'Récupération';
            typeAbsenceSelect.insertBefore(optionRecup, typeAbsenceSelect.lastElementChild);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des infos salarié:', error);
    }
}

// Afficher/masquer les champs spécifiques Récup
document.getElementById('typeAbsence').addEventListener('change', (e) => {
    const recupFields = document.getElementById('recupFields');
    if (e.target.value === 'RECUP') {
        recupFields.style.display = 'block';
    } else {
        recupFields.style.display = 'none';
    }
});

// Afficher/masquer le champ heures selon le type de récup
document.getElementById('recupType').addEventListener('change', (e) => {
    const recupHeuresGroup = document.getElementById('recupHeuresGroup');
    if (e.target.value === 'heures') {
        recupHeuresGroup.style.display = 'block';
        document.getElementById('recupHeures').required = true;
    } else {
        recupHeuresGroup.style.display = 'none';
        document.getElementById('recupHeures').required = false;
    }
});

// Bouton "Calculer la durée" (reprise du code existant)
document.getElementById('btnCalculer').addEventListener('click', async () => {
    const typeAbsence = document.getElementById('typeAbsence').value;
    const dateDebut = document.getElementById('dateDebut').value;
    const dateFin = document.getElementById('dateFin').value;
    const periodeType = document.getElementById('periodeType').value;
    const recupType = document.getElementById('recupType').value;
    const recupHeures = document.getElementById('recupHeures').value;
    
    const errorMessage = document.getElementById('errorMessage');
    const alerteSolde = document.getElementById('alerteSolde');
    const alertePeriode = document.getElementById('alertePeriode');
    const resumeBox = document.getElementById('resumeAbsence');
    
    // Réinitialiser les messages
    errorMessage.classList.remove('show');
    alerteSolde.classList.remove('show');
    alertePeriode.classList.remove('show');
    errorMessage.textContent = '';
    alerteSolde.textContent = '';
    alertePeriode.textContent = '';
    
    // Validations
    if (!typeAbsence) {
        errorMessage.textContent = 'Veuillez sélectionner un type d\'absence';
        errorMessage.classList.add('show');
        return;
    }
    
    if (!dateDebut || !dateFin) {
        errorMessage.textContent = 'Veuillez saisir les dates';
        errorMessage.classList.add('show');
        return;
    }
    
    if (new Date(dateDebut) > new Date(dateFin)) {
        errorMessage.textContent = 'La date de fin doit être après la date de début';
        errorMessage.classList.add('show');
        return;
    }
    
    try {
        let dureeJours = 0;
        let dureeHeures = 0;
        
        // Pour la récup en heures
        if (typeAbsence === 'RECUP' && recupType === 'heures') {
            if (!recupHeures || recupHeures <= 0) {
                errorMessage.textContent = 'Veuillez saisir le nombre d\'heures de récupération';
                errorMessage.classList.add('show');
                return;
            }
            dureeHeures = parseFloat(recupHeures);
            dureeJours = dureeHeures / 7;
        } else {
            const result = await window.api.calculerDuree(dateDebut, dateFin, periodeType);
            dureeJours = result.dureeJours;
            dureeHeures = dureeJours * 7;
        }
        
        // Récupérer les soldes actuels
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        // Calcul du décompte selon le type
        let decompteCP_N1 = 0;
        let decompteCP_N = 0;
        let decompteRTT = 0;
        let decompteRecup = 0;
        let soldeApres = '';
        let decompteTexte = '';
        
        if (typeAbsence === 'CP') {
            if (soldes.cp_n1 >= dureeJours) {
                decompteCP_N1 = dureeJours;
            } else {
                decompteCP_N1 = soldes.cp_n1;
                decompteCP_N = dureeJours - soldes.cp_n1;
            }
            
            const nouveauCP_N1 = soldes.cp_n1 - decompteCP_N1;
            const nouveauCP_N = soldes.cp_n - decompteCP_N;
            
            decompteTexte = decompteCP_N1 > 0 
                ? `${decompteCP_N1.toFixed(2)} j de CP N-1` + (decompteCP_N > 0 ? ` + ${decompteCP_N.toFixed(2)} j de CP N` : '')
                : `${decompteCP_N.toFixed(2)} j de CP N`;
            
            if (nouveauCP_N < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauCP_N).toFixed(2)} j`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'RTT') {
            decompteRTT = dureeJours;
            const nouveauRTT = soldes.rtt - decompteRTT;
            decompteTexte = `${decompteRTT.toFixed(2)} j de RTT`;
            
            if (nouveauRTT < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRTT).toFixed(2)} j`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'RECUP') {
            decompteRecup = dureeHeures;
            const nouveauRecup = soldes.recup_heures - decompteRecup;
            decompteTexte = `${decompteRecup.toFixed(1)} h`;
            
            if (nouveauRecup < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRecup).toFixed(1)} h`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'MALADIE') {
            decompteTexte = 'Pas de décompte';
        }
        
        // Alerte si période passée
        if (new Date(dateDebut) < new Date()) {
            alertePeriode.textContent = '⚠️ Période passée';
            alertePeriode.classList.add('show');
        }
        
        // Afficher le résumé
        document.getElementById('resumeDuree').textContent = 
            typeAbsence === 'RECUP' && recupType === 'heures' 
                ? `${dureeHeures.toFixed(1)} h` 
                : `${dureeJours.toFixed(2)} j`;
        
        document.getElementById('resumeDecompte').textContent = decompteTexte;
        
        resumeBox.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur lors du calcul:', error);
        errorMessage.textContent = 'Erreur lors du calcul';
        errorMessage.classList.add('show');
    }
});

// Bouton déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});

// ========== INITIALISATION ==========

async function init() {
    await loadSoldes();
    await initFormAbsence();
    await chargerCalendrier();
}

init();