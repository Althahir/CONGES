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

// ========== TOGGLE THEME SOMBRE/CLAIR ==========
(function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.querySelector('#btnThemeToggle i');
    if (icon) icon.className = saved === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
})();

document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const icon = document.querySelector('#btnThemeToggle i');
    icon.className = next === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
});

// Variables globales
let anneeActuelle = new Date().getFullYear();
let joursFeries = [];
let absences = [];
let sectionActive = 'mes-conges';

// ========== NAVIGATION ENTRE SECTIONS ==========

const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.content-section');

const titresSection = {
    'mes-conges': 'Mes Congés',
    'calendrier': 'Calendrier Global'
};

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        btn.classList.add('active');

        sectionActive = btn.getAttribute('data-section');
        document.getElementById(`${sectionActive}-section`).classList.add('active');
        document.getElementById('headerTitle').textContent = titresSection[sectionActive];

        if (sectionActive === 'calendrier') {
            chargerCalendrierGlobal();
        }
    });
});

// ========== GESTION DE L'ANNÉE (unifiée) ==========

document.getElementById('anneeActuelle').textContent = anneeActuelle;

function changerAnnee(delta) {
    if (anneeActuelle + delta < 2022) return;
    anneeActuelle += delta;
    document.getElementById('anneeActuelle').textContent = anneeActuelle;
    // Recharger la section active
    if (sectionActive === 'mes-conges') {
        chargerCalendrier();
    } else if (sectionActive === 'calendrier') {
        chargerCalendrierGlobal();
    }
}

document.getElementById('btnPrevYear').addEventListener('click', () => changerAnnee(-1));
document.getElementById('btnNextYear').addEventListener('click', () => changerAnnee(1));

// ========== CHARGEMENT DES DONNÉES ==========

async function loadSoldes() {
    try {
        const annee = anneeActuelle;
        const soldes = await window.api.getSoldes(user.id, annee);
        const salarie = await window.api.getSalarie(user.id);
        
        if (soldes) {
            document.getElementById('solde-cp-n1').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n').textContent = soldes.cp_n.toFixed(2) + 'j';
            document.querySelector('.solde-card-compact.cp-n1')?.classList.toggle('solde-vide', soldes.cp_n1 === 0);
            document.querySelector('.solde-card-compact.cp-n')?.classList.toggle('solde-vide', soldes.cp_n === 0);

            // RTT
            const tuileRTT = document.querySelector('.solde-card-compact.rtt');
            if (salarie.a_droit_rtt === 1) {
                document.getElementById('solde-rtt').textContent = soldes.rtt.toFixed(2) + 'j';
                if (tuileRTT) {
                    tuileRTT.classList.remove('sans-droit');
                    tuileRTT.classList.toggle('solde-vide', soldes.rtt === 0);
                }
            } else {
                document.getElementById('solde-rtt').textContent = 'N/A';
                if (tuileRTT) {
                    tuileRTT.classList.add('sans-droit');
                    tuileRTT.classList.remove('solde-vide');
                }
            }

            // Récup
            const tuileRecup = document.querySelector('.solde-card-compact.recup');
            if (salarie.a_droit_recup === 1) {
                const recupJours = Math.floor(soldes.recup_heures / 7);
                const recupHeuresRestantes = (soldes.recup_heures % 7).toFixed(1);
                document.getElementById('solde-recup').innerHTML =
                    `${soldes.recup_heures.toFixed(1)}h<p>(${recupJours}j ${recupHeuresRestantes}h)</p>`;
                if (tuileRecup) {
                    tuileRecup.classList.remove('sans-droit');
                    tuileRecup.classList.toggle('solde-vide', soldes.recup_heures === 0);
                }
            } else {
                document.getElementById('solde-recup').textContent = 'N/A';
                if (tuileRecup) {
                    tuileRecup.classList.add('sans-droit');
                    tuileRecup.classList.remove('solde-vide');
                }
            }
        }
        
        // Afficher le bouton heures sup si le salarié a droit récup
        const btnHeuresSup = document.getElementById('btnAjouterHeuresSup');
        if (btnHeuresSup && salarie && salarie.a_droit_recup === 1) {
            btnHeuresSup.style.display = 'block';
        } else if (btnHeuresSup) {
            btnHeuresSup.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Erreur chargement soldes:', error);
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
        console.log('Absences brutes:', absences);
        console.log('Chargement absences pour année:', anneeActuelle); // ← AJOUTE

        
        // Filtrer pour l'année actuelle (inclure les absences qui touchent l'année)
        absences = absences.filter(abs => {
            const anneeDebut = new Date(abs.date_debut).getFullYear();
            const anneeFin = new Date(abs.date_fin).getFullYear();
            // Garder si l'absence commence OU finit dans l'année affichée
            return anneeDebut === anneeActuelle || anneeFin === anneeActuelle;
        });
        
        console.log('Absences filtrées pour', anneeActuelle, ':', absences);
    } catch (error) {
        console.error('Erreur lors du chargement des absences:', error);
        absences = [];
    }
}

// ========== GÉNÉRATION DU CALENDRIER ==========

function genererCalendrier() {
    const calendrierContainer = document.getElementById('calendrierAnnuel');
    calendrierContainer.innerHTML = '';
    
    const nomsJoursCourts = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
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
        // Adapter pour commencer le lundi (0 = lundi, 6 = dimanche)
        let premierJourSemaine = premierJour.getDay() - 1;
        if (premierJourSemaine === -1) premierJourSemaine = 6; // Si dimanche, mettre à la fin
        
        // Jours vides avant le début du mois
        for (let i = 0; i < premierJourSemaine; i++) {
            const jourVide = document.createElement('div');
            jourVide.className = 'jour vide';
            joursMoisDiv.appendChild(jourVide);
        }
        
        // Jours du mois
        for (let jour = 1; jour <= nbJours; jour++) {
            const date = new Date(anneeActuelle, mois, jour);
            // Créer la date ISO manuellement pour éviter les problèmes de fuseau horaire
            const dateISO = `${anneeActuelle}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            const dayOfWeek = date.getDay();
            
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour';
            jourDiv.textContent = jour;
            
            // Weekend (samedi = 6, dimanche = 0)
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                jourDiv.classList.add('weekend');
            }
            
           // Jour férié
            const jourFerie = joursFeries.find(f => f.date === dateISO);
            if (jourFerie) {
                jourDiv.classList.add('ferie');
                jourDiv.setAttribute('data-tooltip', jourFerie.libelle);
            }

            // Absence
            const absence = absences.find(abs => {
                return dateISO >= abs.date_debut && dateISO <= abs.date_fin;
            });

            // Ne colorer que si ce n'est PAS un jour chômé
            if (absence && dayOfWeek !== 0 && dayOfWeek !== 6 && !jourFerie) {
                const type = absence.type.toUpperCase();
                if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                    jourDiv.classList.add('cp');
                    jourDiv.setAttribute('data-tooltip', 'Congés payés');
                } else if (type === 'RTT') {
                    jourDiv.classList.add('rtt');
                    jourDiv.setAttribute('data-tooltip', 'RTT');
                } else if (type === 'RECUP') {
                    jourDiv.classList.add('recup');
                    jourDiv.setAttribute('data-tooltip', 'Récupération');
                } else if (type === 'MALADIE') {
                    jourDiv.classList.add('maladie');
                    jourDiv.setAttribute('data-tooltip', 'Arrêt maladie');
                }

                // Ajouter le commentaire si présent
                if (absence.commentaire) {
                    const currentTooltip = jourDiv.getAttribute('data-tooltip');
                    jourDiv.setAttribute('data-tooltip', `${currentTooltip} - ${absence.commentaire}`);
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
// Fonction pour surligner les jours en prévisualisation
function surlignerJoursPrevisualisation(dateDebut, dateFin) {
    // Enlever tous les surlignages précédents
    document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));
    
    if (!dateDebut || !dateFin) return;
    
    // Parser les dates manuellement en ISO
    const [anneeDebut, moisDebut, jourDebut] = dateDebut.split('-').map(Number);
    const [anneeFin, moisFin, jourFin] = dateFin.split('-').map(Number);
    
    // Parcourir chaque jour du calendrier
    document.querySelectorAll('.jour').forEach(jourDiv => {
        const jourTexte = jourDiv.textContent.trim();
        if (!jourTexte || jourDiv.classList.contains('vide')) return;
        
        // Récupérer le mois depuis le parent
        const moisDiv = jourDiv.closest('.mois-calendrier');
        const moisHeader = moisDiv.querySelector('.mois-header').textContent;
        const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const moisIndex = nomsMois.indexOf(moisHeader);
        
        if (moisIndex === -1) return;
        
        const jour = parseInt(jourTexte);
        
        // Créer la date ISO du jour du calendrier
        const dateJourISO = `${anneeActuelle}-${String(moisIndex + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
        
        // Si le jour est dans la plage, le surligner
        if (dateJourISO >= dateDebut && dateJourISO <= dateFin) {
            jourDiv.classList.add('preview');
        }
    });
}

// Bouton "Calculer la durée" (reprise du code existant)
// Fonction de calcul (extraite pour être réutilisable)
async function calculerDureeAbsence() {
    const typeAbsence = document.getElementById('typeAbsence').value;
    const dateDebut = document.getElementById('dateDebut').value;
    const dateFin = document.getElementById('dateFin').value;
    const debutPeriode = document.getElementById('debutAprem').checked ? 'apres-midi' : 'matin';
    const finPeriode = document.getElementById('finMidi').checked ? 'midi' : 'fin-journee';
    const recupType = document.getElementById('recupType').value;
    const recupHeures = document.getElementById('recupHeures').value;
    
    const errorMessage = document.getElementById('errorMessage');
    const alerteSolde = document.getElementById('alerteSolde');
    const alertePeriode = document.getElementById('alertePeriode');
    const resumeBox = document.getElementById('resumeAbsence');
    
    // Réinitialiser les messages
    errorMessage.classList.remove('show');
    alerteSolde.classList.remove('show', 'alert-warning');
    alertePeriode.classList.remove('show', 'alert-warning');
    errorMessage.textContent = '';
    alerteSolde.textContent = '';
    alertePeriode.textContent = '';
    
    // Si pas de dates, masquer le résumé
    if (!dateDebut || !dateFin) {
        resumeBox.style.display = 'none';
    return;
    }
    
    if (new Date(dateDebut) > new Date(dateFin)) {
        errorMessage.textContent = 'La date de fin doit être après la date de début';
        errorMessage.classList.add('show');
        resumeBox.style.display = 'none';
        return;
    }

    try {
    let dureeJours = 0;
    let dureeHeures = 0;

    // Calculer la durée d'abord
    const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
    dureeJours = result.dureeJours;
    dureeHeures = dureeJours * 7;
    
    // Afficher la durée
    document.getElementById('resumeDuree').textContent = `${dureeJours.toFixed(2)} j`;

    // Surligner les jours dans le calendrier
    surlignerJoursPrevisualisation(dateDebut, dateFin);

    // Vérifier les chevauchements avec les absences existantes
    const chevauchement = absences.find(abs => {
    // Convertir les dates pour comparaison
    const absDebut = abs.date_debut;
    const absFin = abs.date_fin;
    
    // Chevauchement si :
    // - dateDebut est entre absDebut et absFin
    // - OU dateFin est entre absDebut et absFin
    // - OU l'absence existante est complètement incluse dans la nouvelle période
    return (dateDebut <= absFin && dateFin >= absDebut);
});

if (chevauchement) {
    const typeTexte = {
        'CP_N': 'CP',
        'CP_N1': 'CP N-1',
        'RTT': 'RTT',
        'RECUP': 'Récupération',
        'MALADIE': 'Arrêt maladie'
    }[chevauchement.type] || chevauchement.type;
    
    alertePeriode.textContent = `⚠️ Chevauchement avec une absence existante (${typeTexte} du ${chevauchement.date_debut} au ${chevauchement.date_fin})`;
    alertePeriode.classList.add('show', 'alert-warning');
}

    // Si pas de type, juste afficher la durée
    if (!typeAbsence) {
        document.getElementById('resumeDecompte').textContent = 'Sélectionnez un type';
        resumeBox.style.display = 'block';
        return;
    }
        
        // Récupérer les soldes actuels
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        // Calcul du décompte selon le type
        let decompteTexte = '';
        
        if (typeAbsence === 'CP') {
            let decompteCP_N1 = 0;
            let decompteCP_N = 0;
            
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
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = `✓ Solde suffisant`;
            }
            
        } else if (typeAbsence === 'RTT') {
            const nouveauRTT = soldes.rtt - dureeJours;
            decompteTexte = `${dureeJours.toFixed(2)} j de RTT`;
            
            if (nouveauRTT < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRTT).toFixed(2)} j`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = `✓ Solde suffisant`;
            }
            
        } else if (typeAbsence === 'RECUP') {
            const nouveauRecup = soldes.recup_heures - dureeHeures;
            decompteTexte = `${dureeHeures.toFixed(1)} h`;
            
            if (nouveauRecup < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRecup).toFixed(1)} h`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = `✓ Solde suffisant`;
            }
            
        } else if (typeAbsence === 'MALADIE') {
            decompteTexte = 'Pas de décompte';
        }
        
        // Alerte si période passée
        if (new Date(dateDebut) < new Date()) {
            const msgExistant = alertePeriode.textContent;
            if (msgExistant) {
                alertePeriode.textContent = msgExistant + ' | ⚠️ Période passée';
            } else {
                alertePeriode.textContent = '⚠️ Période passée';
            }
            alertePeriode.classList.add('show', 'alert-warning');
        }

        if (!alertePeriode.textContent) {
            alertePeriode.textContent = '✓ Période valide';
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
        resumeBox.style.display = 'none';
    }
}

// Calculer automatiquement quand les champs changent
document.getElementById('typeAbsence').addEventListener('change', calculerDureeAbsence);
document.getElementById('dateDebut').addEventListener('change', calculerDureeAbsence);
document.getElementById('dateFin').addEventListener('change', calculerDureeAbsence);
document.getElementById('debutAprem').addEventListener('change', calculerDureeAbsence);
document.getElementById('finMidi').addEventListener('change', calculerDureeAbsence);
document.getElementById('recupType').addEventListener('change', calculerDureeAbsence);
document.getElementById('recupHeures').addEventListener('input', calculerDureeAbsence);


// Bouton déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});
// ========== VALIDATION ET ENREGISTREMENT DE L'ABSENCE ==========

document.getElementById('formAbsence').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const typeAbsence = document.getElementById('typeAbsence').value;
    const dateDebut = document.getElementById('dateDebut').value;
    const dateFin = document.getElementById('dateFin').value;
    const debutPeriode = document.getElementById('debutAprem').checked ? 'apres-midi' : 'matin';
    const finPeriode = document.getElementById('finMidi').checked ? 'midi' : 'fin-journee';
    const recupType = document.getElementById('recupType').value;
    const recupHeures = document.getElementById('recupHeures').value;
    const commentaire = document.getElementById('commentaire').value;
    
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    // Réinitialiser les messages
    errorMessage.classList.remove('show');
    successMessage.classList.remove('show');
    errorMessage.textContent = '';
    successMessage.textContent = '';
    
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
    
    try {
        let dureeJours = 0;
        let dureeHeures = 0;
        let typeToSave = typeAbsence;
        
        // Calculer la durée
        if (typeAbsence === 'RECUP' && recupType === 'heures') {
            if (!recupHeures || recupHeures <= 0) {
                errorMessage.textContent = 'Veuillez saisir le nombre d\'heures';
                errorMessage.classList.add('show');
                return;
            }
            dureeHeures = parseFloat(recupHeures);
            dureeJours = dureeHeures / 7;
        } else {
            const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
            dureeJours = result.dureeJours;
            dureeHeures = dureeJours * 7;
        }

        // Pour les CP, on enregistre en tant que CP_N (le backend gérera CP_N1 puis CP_N)
        if (typeAbsence === 'CP') {
            typeToSave = 'CP_N';
        }
        
        // Créer l'absence
        const absenceData = {
            salarie_id: user.id,
            type: typeToSave,
            date_debut: dateDebut,
            date_fin: dateFin,
            duree_jours: typeAbsence === 'RECUP' && recupType === 'heures' ? null : dureeJours,
            duree_heures: typeAbsence === 'RECUP' ? dureeHeures : null,
            commentaire: commentaire || null
        };
        
        const resultAbsence = await window.api.createAbsence(absenceData);
        
        if (resultAbsence.success) {
            // Mettre à jour les soldes
            const resultSoldes = await window.api.updateSoldesAfterAbsence(
                user.id, 
                anneeActuelle, 
                typeAbsence, 
                dureeJours, 
                dureeHeures
            );
            
            // Générer le PDF
            const pdfData = {
                salarie: {
                    nom: user.nom,
                    prenom: user.prenom
                },
                absence: {
                    type: typeToSave,
                    date_debut: dateDebut,
                    date_fin: dateFin,
                    duree_jours: typeAbsence === 'RECUP' && recupType === 'heures' ? null : dureeJours,
                    duree_heures: typeAbsence === 'RECUP' ? dureeHeures : null,
                    commentaire: commentaire || null
                },
                soldes: resultSoldes.nouveaux_soldes
            };
            
            try {
                const pdfResult = await window.api.genererPDF(pdfData);
                if (pdfResult.success) {
                    console.log('PDF généré :', pdfResult.filePath);
                }
            } catch (error) {
                console.error('Erreur génération PDF:', error);
            }
            
            // Recharger les données
            await loadSoldes();
            await chargerCalendrier();
            // await afficherHistorique();
            // Message de succès
            successMessage.textContent = '✅ Absence enregistrée avec succès ! PDF généré.';
            successMessage.classList.add('show');
            
            // Réinitialiser le formulaire
            document.getElementById('formAbsence').reset();
            document.getElementById('resumeAbsence').style.display = 'none';
            document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));
            
            // Masquer le message après 3 secondes
            setTimeout(() => {
                successMessage.classList.remove('show');
            }, 3000);
        }
        
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement:', error);
        errorMessage.textContent = 'Erreur lors de l\'enregistrement de l\'absence';
        errorMessage.classList.add('show');
    }
});

// ========== AFFICHAGE DE L'HISTORIQUE ==========

async function afficherHistorique() {
    try {
        const historiqueContainer = document.getElementById('historiqueList');
        
        // Récupérer les absences
        const toutesAbsences = await window.api.getAbsences(user.id);
        
        // Trier par date décroissante et prendre les 5 dernières
        const dernieresAbsences = toutesAbsences
            .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
            .slice(0, 5);
        
        if (dernieresAbsences.length === 0) {
            historiqueContainer.innerHTML = '<p class="text-muted">Aucune absence enregistrée</p>';
            return;
        }
        
        // Générer le HTML
        historiqueContainer.innerHTML = dernieresAbsences.map(abs => {
            const dateD = new Date(abs.date_debut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const dateF = new Date(abs.date_fin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            
            const typeLabels = {
                'CP_N': 'CP',
                'CP_N1': 'CP N-1',
                'RTT': 'RTT',
                'RECUP': 'Récup',
                'MALADIE': 'Maladie'
            };
            
            const typeClasses = {
                'CP_N': 'cp',
                'CP_N1': 'cp',
                'RTT': 'rtt',
                'RECUP': 'recup',
                'MALADIE': 'maladie'
            };
            
            const duree = abs.duree_jours 
                ? `${abs.duree_jours.toFixed(1)}j`
                : `${abs.duree_heures.toFixed(1)}h`;
            
            return `
            <div class="historique-item ${typeClasses[abs.type]}" data-id="${abs.id}">
                <div class="historique-date">${dateD} - ${dateF}</div>
                <div class="historique-type">${typeLabels[abs.type]} • ${duree}</div>
                ${abs.commentaire ? `<div class="historique-duree">${abs.commentaire}</div>` : ''}
            </div>
            `;
        }).join('');
        

        
    } catch (error) {
        console.error('Erreur chargement historique:', error);
    }
}


// ========== MODAL HEURES SUPPLÉMENTAIRES ==========

function initModalHeuresSup() {
    const modal = document.getElementById('modalHeuresSup');
    if (!modal) return;

    document.getElementById('heuresSupDate').value = new Date().toISOString().split('T')[0];

    document.getElementById('btnAjouterHeuresSup').addEventListener('click', () => {
        document.getElementById('heuresSupMsg').style.display = 'none';
        modal.style.display = 'flex';
    });

    document.getElementById('closeModalHeuresSup').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnAnnulerHeuresSup').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('btnEnregistrerHeuresSup').addEventListener('click', async () => {
        const heures = parseFloat(document.getElementById('heuresSupNb').value);
        const date = document.getElementById('heuresSupDate').value;
        const commentaire = document.getElementById('heuresSupCommentaire').value.trim();
        const msg = document.getElementById('heuresSupMsg');

        if (!heures || heures <= 0 || !date) {
            msg.textContent = "Veuillez renseigner le nombre d'heures et la date.";
            msg.className = 'form-error';
            msg.style.display = 'block';
            return;
        }

        try {
            await window.api.ajouterRecup({
                salarie_id: user.id,
                annee: anneeActuelle,
                heures,
                date,
                commentaire: commentaire || `Heures supplémentaires du ${date}`
            });

            msg.textContent = `${heures}h enregistrées avec succès.`;
            msg.className = 'form-success';
            msg.style.display = 'block';

            await loadSoldes();

            setTimeout(() => {
                modal.style.display = 'none';
                document.getElementById('heuresSupNb').value = '';
                document.getElementById('heuresSupCommentaire').value = '';
                msg.style.display = 'none';
            }, 1500);
        } catch (error) {
            console.error('Erreur ajout heures sup:', error);
            msg.textContent = "Erreur lors de l'enregistrement.";
            msg.className = 'form-error';
            msg.style.display = 'block';
        }
    });
}

// ========== CALENDRIER GLOBAL ==========

async function chargerCalendrierGlobal() {
    try {
        const container = document.getElementById('calendrierGlobal');

        const salaries = await window.api.getAllSalaries();
        const toutesAbsences = await window.api.getAllAbsences();
        const joursFeriesCal = await window.api.getJoursFeries(anneeActuelle);

        const absencesAnnee = toutesAbsences.filter(abs => {
            const anneeDebut = new Date(abs.date_debut).getFullYear();
            const anneeFin = new Date(abs.date_fin).getFullYear();
            return anneeDebut === anneeActuelle || anneeFin === anneeActuelle;
        });

        const salariesAvecAbsences = new Set();
        absencesAnnee.forEach(abs => salariesAvecAbsences.add(abs.salarie_id));

        const salariesActifs = salaries
            .filter(sal => salariesAvecAbsences.has(sal.id))
            .sort((a, b) => `${a.nom} ${a.prenom}`.toLowerCase().localeCompare(`${b.nom} ${b.prenom}`.toLowerCase()));

        const couleursDisponibles = [
            'rgb(249, 198, 73)', 'rgb(237, 113, 17)', 'rgb(181, 22, 63)',
            'rgb(116, 43, 135)', 'rgb(0, 108, 137)', '#10B981', '#8B5CF6', '#14B8A6'
        ];

        const couleursSalaries = {};
        const positionsSalaries = {};
        salariesActifs.forEach((sal, index) => {
            couleursSalaries[sal.id] = couleursDisponibles[index % 8];
            positionsSalaries[sal.id] = index % 8;
        });

        const legendeHTML = `
            <div class="legende-salaries">
                ${salariesActifs.map(sal => `
                    <div class="legende-salarie">
                        <span class="legende-color" style="background: ${couleursSalaries[sal.id]}"></span>
                        <span>${sal.prenom} ${sal.nom}</span>
                    </div>
                `).join('')}
            </div>
        `;

        const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

        let tableHTML = '<div class="calendrier-lineaire"><table class="calendrier-table">';
        tableHTML += '<thead><tr>';
        nomsMois.forEach(mois => { tableHTML += `<th>${mois}</th>`; });
        tableHTML += '</tr></thead><tbody>';

        for (let jour = 1; jour <= 31; jour++) {
            tableHTML += '<tr>';
            for (let mois = 0; mois < 12; mois++) {
                const dernierJourDuMois = new Date(anneeActuelle, mois + 1, 0).getDate();
                if (jour > dernierJourDuMois) {
                    tableHTML += '<td></td>';
                } else {
                    const dateISO = `${anneeActuelle}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
                    const date = new Date(anneeActuelle, mois, jour);
                    const dayOfWeek = date.getDay();
                    const estFerie = joursFeriesCal.some(f => f.date === dateISO);
                    const ferie = joursFeriesCal.find(f => f.date === dateISO);
                    const estWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    const absentsJour = absencesAnnee.filter(abs => dateISO >= abs.date_debut && dateISO <= abs.date_fin);

                    let cellClass = '';
                    if (estFerie) cellClass += 'jour-ferie ';
                    if (estWeekend) cellClass += 'jour-weekend ';

                    let tooltip = '';
                    if (estFerie) tooltip = ferie.libelle;
                    if (absentsJour.length > 0) {
                        const noms = absentsJour.map(abs => `${abs.prenom} ${abs.nom}`).join(', ');
                        tooltip = tooltip ? `${tooltip} - ${noms}` : noms;
                    }

                    const lettresJours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                    let jourSemaineIndex = dayOfWeek - 1;
                    if (jourSemaineIndex === -1) jourSemaineIndex = 6;
                    const lettreJour = lettresJours[jourSemaineIndex];

                    if (estWeekend || estFerie) {
                        tableHTML += `<td class="${cellClass}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>`;
                        const jourCellClass = estFerie ? 'jour-cell jour-ferie-cell' : 'jour-cell';
                        tableHTML += `<div class="${jourCellClass}"><span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span>`;
                        tableHTML += '<div class="indicateurs-wrapper">';
                        for (let i = 0; i < 8; i++) tableHTML += '<div class="indicateur-colonne"></div>';
                        tableHTML += '</div>';
                        if (estFerie) tableHTML += '<span class="drapeau-ferie">🚩</span>';
                        tableHTML += '</div></td>';
                        continue;
                    }

                    tableHTML += `<td class="${cellClass}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>`;
                    if (absentsJour.length > 8) {
                        tableHTML += `<div class="jour-cell"><span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span><span class="surcharge">8+</span></div>`;
                    } else {
                        const jourCellClass = estFerie ? 'jour-cell jour-ferie-cell' : 'jour-cell';
                        tableHTML += `<div class="${jourCellClass}"><span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span>`;
                        tableHTML += '<div class="indicateurs-wrapper">';
                        const indicateurs = new Array(8).fill(null);
                        absentsJour.forEach(abs => {
                            const position = positionsSalaries[abs.salarie_id];
                            if (position !== undefined && position < 8) indicateurs[position] = couleursSalaries[abs.salarie_id];
                        });
                        indicateurs.forEach(couleur => {
                            tableHTML += couleur
                                ? `<div class="indicateur-colonne actif" style="background: ${couleur};"></div>`
                                : '<div class="indicateur-colonne"></div>';
                        });
                        tableHTML += '</div>';
                        if (estFerie) tableHTML += '<span class="drapeau-ferie">🚩</span>';
                        tableHTML += '</div>';
                    }
                    tableHTML += '</td>';
                }
            }
            tableHTML += '</tr>';
        }

        tableHTML += '</tbody></table></div>';
        container.innerHTML = legendeHTML + tableHTML;

    } catch (error) {
        console.error('Erreur chargement calendrier global:', error);
    }
}

// ========== INITIALISATION ==========

async function init() {
    await loadSoldes();
    await initFormAbsence();
    await chargerCalendrier();
    initModalHeuresSup();
}

init();