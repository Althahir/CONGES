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

// Charger les soldes
async function loadSoldes() {
    try {
        const anneeActuelle = new Date().getFullYear();
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        if (soldes) {
            document.getElementById('solde-cp-n').textContent = soldes.cp_n.toFixed(2);
            document.getElementById('solde-cp-n1').textContent = soldes.cp_n1.toFixed(2);
            document.getElementById('solde-rtt').textContent = soldes.rtt.toFixed(2);
            
            // Afficher récup en jours et heures
            const recupJours = Math.floor(soldes.recup_heures / 7);
            const recupHeuresRestantes = (soldes.recup_heures % 7).toFixed(1);
            document.getElementById('solde-recup').innerHTML = 
                `${soldes.recup_heures.toFixed(1)}<br><small style="font-size: 0.5em; color: #999;">(${recupJours}j ${recupHeuresRestantes}h)</small>`;
        } else {
            // Créer les soldes si ils n'existent pas
            await window.api.updateSoldes(user.id, anneeActuelle, {
                cp_n: 0,
                cp_n1: 0,
                rtt: 0,
                recup_heures: 0
            });
            loadSoldes(); // Recharger
        }
    } catch (error) {
        console.error('Erreur lors du chargement des soldes:', error);
    }
}

// Navigation entre les pages
const navItems = document.querySelectorAll('.nav-item');
const contentPages = document.querySelectorAll('.content-page');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Retirer l'active de tous
        navItems.forEach(nav => nav.classList.remove('active'));
        contentPages.forEach(page => page.classList.remove('active'));
        
        // Ajouter active au cliqué
        item.classList.add('active');
        
        // Afficher la bonne page
        const pageName = item.getAttribute('data-page');
        document.getElementById(`${pageName}-page`).classList.add('active');
        
        // Changer le titre
        const titles = {
            'accueil': 'Tableau de bord',
            'calendrier': 'Mon calendrier',
            'poser-absence': 'Poser une absence',
            'historique': 'Historique de mes absences'
        };
        document.getElementById('pageTitle').textContent = titles[pageName] || 'Mon espace';
    });
});

// Bouton poser absence
document.getElementById('btnPoserAbsence').addEventListener('click', () => {
    document.querySelector('[data-page="poser-absence"]').click();
});

// Bouton déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});

// Charger les données au démarrage
loadSoldes();

// ========== GESTION DU FORMULAIRE D'ABSENCE ==========

// Charger les infos du salarié pour afficher les bons types d'absence
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

// Initialiser le formulaire quand on arrive sur la page
document.querySelector('[data-page="poser-absence"]').addEventListener('click', () => {
    initFormAbsence();
});

// Bouton "Calculer la durée"
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
            dureeJours = dureeHeures / 7; // Conversion pour affichage
        } else {
            // Calcul standard (jours ouvrés)
            const result = await window.api.calculerDuree(dateDebut, dateFin, periodeType);
            dureeJours = result.dureeJours;
            dureeHeures = dureeJours * 7; // Pour la récup
        }
        
        // Récupérer les soldes actuels
        const anneeActuelle = new Date().getFullYear();
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        // Calcul du décompte selon le type
        let decompteCP_N1 = 0;
        let decompteCP_N = 0;
        let decompteRTT = 0;
        let decompteRecup = 0;
        let soldeApres = '';
        let decompteTexte = '';
        
        if (typeAbsence === 'CP') {
            // Décompte d'abord CP N-1, puis CP N
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
            
            soldeApres = `CP N-1: ${nouveauCP_N1.toFixed(2)} j | CP N: ${nouveauCP_N.toFixed(2)} j`;
            
            // Alerte si solde négatif
            if (nouveauCP_N < 0) {
                alerteSolde.textContent = `⚠️ Attention : vous passerez en solde négatif de ${Math.abs(nouveauCP_N).toFixed(2)} jours de CP N`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'RTT') {
            decompteRTT = dureeJours;
            const nouveauRTT = soldes.rtt - decompteRTT;
            decompteTexte = `${decompteRTT.toFixed(2)} j de RTT`;
            soldeApres = `RTT: ${nouveauRTT.toFixed(2)} j`;
            
            if (nouveauRTT < 0) {
                alerteSolde.textContent = `⚠️ Attention : vous passerez en solde négatif de ${Math.abs(nouveauRTT).toFixed(2)} jours de RTT`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'RECUP') {
            decompteRecup = dureeHeures;
            const nouveauRecup = soldes.recup_heures - decompteRecup;
            decompteTexte = `${decompteRecup.toFixed(1)} h de récupération`;
            soldeApres = `Récup: ${nouveauRecup.toFixed(1)} h`;
            
            if (nouveauRecup < 0) {
                alerteSolde.textContent = `⚠️ Attention : vous passerez en solde négatif de ${Math.abs(nouveauRecup).toFixed(1)} heures de récup`;
                alerteSolde.classList.add('show');
            }
            
        } else if (typeAbsence === 'MALADIE') {
            decompteTexte = 'Arrêt maladie (pas de décompte)';
            soldeApres = 'Aucun impact sur les soldes';
        }
        
        // Alerte si période passée
        if (new Date(dateDebut) < new Date()) {
            alertePeriode.textContent = '⚠️ Attention : vous posez une absence sur une période passée';
            alertePeriode.classList.add('show');
        }
        
        // Afficher le résumé
        document.getElementById('resumeDuree').textContent = 
            typeAbsence === 'RECUP' && recupType === 'heures' 
                ? `${dureeHeures.toFixed(1)} heures` 
                : `${dureeJours.toFixed(2)} jours`;
        
        document.getElementById('resumeDecompte').textContent = decompteTexte;
        document.getElementById('resumeSoldeApres').textContent = soldeApres;
        
        resumeBox.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur lors du calcul:', error);
        errorMessage.textContent = 'Erreur lors du calcul de la durée';
        errorMessage.classList.add('show');
    }
});