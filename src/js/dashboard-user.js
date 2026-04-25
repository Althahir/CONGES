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
    if (icon) icon.className = saved === 'dark' ? 'fa-solid fa-lightbulb' : 'fa-solid fa-moon';
})();

document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const icon = document.querySelector('#btnThemeToggle i');
    icon.className = next === 'dark' ? 'fa-solid fa-lightbulb' : 'fa-solid fa-moon';
});

// Variables globales
let anneeActuelle = new Date().getFullYear();
let joursFeries = [];
let absences = [];
let hasChevauchement = false;
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
        const pending = await window.api.getEnAttenteParSalarie(user.id, annee);

        if (soldes) {
            function appliquerEtatSolde(tuile, valeur) {
                if (!tuile) return;
                tuile.classList.remove('solde-positif', 'solde-zero', 'solde-negatif', 'sans-droit');
                if (valeur > 0) tuile.classList.add('solde-positif');
                else if (valeur === 0) tuile.classList.add('solde-zero');
                else tuile.classList.add('solde-negatif');
            }

            function afficherPending(el, valeur, unite = 'j') {
                if (!el) return;
                if (valeur > 0) {
                    const txt = valeur % 1 === 0 ? valeur : valeur.toFixed(1);
                    el.textContent = `(-${txt}${unite} en attente)`;
                    el.classList.add('has-pending');
                } else {
                    el.textContent = '';
                    el.classList.remove('has-pending');
                }
            }

            document.getElementById('solde-cp-n1').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n').textContent = soldes.cp_n.toFixed(2) + 'j';
            appliquerEtatSolde(document.querySelector('.solde-card-compact.cp-n1'), soldes.cp_n1);
            appliquerEtatSolde(document.querySelector('.solde-card-compact.cp-n'), soldes.cp_n);

            // Pending CP : on répartit comme debiterSoldes (N-1 puis N)
            const cpPending = (pending && pending.cp) || 0;
            const cpN1Pending = Math.min(Math.max(soldes.cp_n1, 0), cpPending);
            const cpNPending = Math.max(0, cpPending - cpN1Pending);
            afficherPending(document.getElementById('solde-cp-n1-pending'), cpN1Pending);
            afficherPending(document.getElementById('solde-cp-n-pending'), cpNPending);

            // RTT
            const tuileRTT = document.querySelector('.solde-card-compact.rtt');
            const pendingRTTEl = document.getElementById('solde-rtt-pending');
            if (salarie.a_droit_rtt === 1) {
                document.getElementById('solde-rtt').textContent = soldes.rtt.toFixed(2) + 'j';
                appliquerEtatSolde(tuileRTT, soldes.rtt);
                afficherPending(pendingRTTEl, (pending && pending.rtt) || 0);
            } else {
                document.getElementById('solde-rtt').textContent = 'N/A';
                if (tuileRTT) {
                    tuileRTT.classList.remove('solde-positif', 'solde-zero', 'solde-negatif');
                    tuileRTT.classList.add('sans-droit');
                }
                afficherPending(pendingRTTEl, 0);
            }

            // Récup
            const tuileRecup = document.querySelector('.solde-card-compact.recup');
            const pendingRecupEl = document.getElementById('solde-recup-pending');
            if (salarie.a_droit_recup === 1) {
                const recupJours = (soldes.recup_heures / 7).toFixed(2);
                document.getElementById('solde-recup').innerHTML =
                    `${soldes.recup_heures.toFixed(1)}h<p>(${recupJours}j)</p>`;
                appliquerEtatSolde(tuileRecup, soldes.recup_heures);
                afficherPending(pendingRecupEl, (pending && pending.recup_heures) || 0, 'h');
            } else {
                document.getElementById('solde-recup').textContent = 'N/A';
                if (tuileRecup) {
                    tuileRecup.classList.remove('solde-positif', 'solde-zero', 'solde-negatif');
                    tuileRecup.classList.add('sans-droit');
                }
                afficherPending(pendingRecupEl, 0);
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

        // Mettre à jour la liste "Mes demandes en cours" (toutes années confondues)
        chargerMesDemandesEnCours(absences);

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

// ========== MES DEMANDES EN COURS (workflow validation) ==========

function escapeHtmlUser(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function chargerMesDemandesEnCours(toutesAbsences) {
    const section = document.getElementById('mesDemandesCours');
    const liste = document.getElementById('mesDemandesCoursListe');
    if (!section || !liste) return;

    const enAttente = (toutesAbsences || []).filter(a => a.statut === 'en_attente');
    if (enAttente.length === 0) {
        section.style.display = 'none';
        liste.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
    const labelsType = { CP: 'CP', CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };

    liste.innerHTML = enAttente.map(d => {
        const dureeStr = (d.type === 'RECUP' && !d.duree_jours) ? `${d.duree_heures}h` : `${(d.duree_jours || 0).toFixed(1)}j`;
        const periode = d.date_debut === d.date_fin ? fmtDate(d.date_debut) : `${fmtDate(d.date_debut)} → ${fmtDate(d.date_fin)}`;
        return `
            <div class="mes-demande-item">
                <div>
                    <div class="mes-demande-item-type">${labelsType[d.type] || d.type} · ${dureeStr}</div>
                    <div class="mes-demande-item-dates">${periode}</div>
                </div>
                <span class="mes-demande-item-badge">En attente</span>
            </div>
        `;
    }).join('');
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
            jourDiv.dataset.date = dateISO;

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
                let tooltipLabel = '';
                if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                    jourDiv.classList.add('cp');
                    tooltipLabel = 'Congés payés';
                } else if (type === 'RTT') {
                    jourDiv.classList.add('rtt');
                    tooltipLabel = 'RTT';
                } else if (type === 'RECUP') {
                    jourDiv.classList.add('recup');
                    tooltipLabel = 'Récupération';
                } else if (type === 'MALADIE') {
                    jourDiv.classList.add('maladie');
                    tooltipLabel = 'Arrêt maladie';
                }

                // Marquer en attente de validation
                if (absence.statut === 'en_attente') {
                    jourDiv.classList.add('en-attente');
                    tooltipLabel += ' — En attente de validation';
                }

                // Ajouter le commentaire si présent
                if (absence.commentaire) {
                    tooltipLabel += ` · ${absence.commentaire}`;
                }
                if (tooltipLabel) jourDiv.setAttribute('data-tooltip', tooltipLabel);
            }
            
            joursMoisDiv.appendChild(jourDiv);
        }

        // Compléter à 42 cases (6 lignes × 7 colonnes) pour uniformiser la hauteur
        const totalCases = premierJourSemaine + nbJours;
        for (let i = totalCases; i < 42; i++) {
            const jourVide = document.createElement('div');
            jourVide.className = 'jour vide';
            joursMoisDiv.appendChild(jourVide);
        }

        moisDiv.appendChild(joursMoisDiv);
        calendrierContainer.appendChild(moisDiv);
    }
}

// ========== DRAG-TO-SELECT SUR LE CALENDRIER ==========

let dragStartDate = null;
let isDragging = false;

function initCalendrierDragSelect() {
    const container = document.getElementById('calendrierAnnuel');
    if (!container) return;

    container.addEventListener('mousedown', (e) => {
        const jourDiv = e.target.closest('.jour[data-date]');
        if (!jourDiv || jourDiv.classList.contains('vide')) return;
        e.preventDefault();
        dragStartDate = jourDiv.dataset.date;
        isDragging = true;
        // Remplir date début immédiatement
        document.getElementById('dateDebut').value = dragStartDate;
        document.getElementById('dateFin').value = dragStartDate;
        surlignerJoursPrevisualisation(dragStartDate, dragStartDate);
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const jourDiv = e.target.closest('.jour[data-date]');
        if (!jourDiv || jourDiv.classList.contains('vide')) return;
        const currentDate = jourDiv.dataset.date;
        const debut = dragStartDate < currentDate ? dragStartDate : currentDate;
        const fin = dragStartDate < currentDate ? currentDate : dragStartDate;
        document.getElementById('dateDebut').value = debut;
        document.getElementById('dateFin').value = fin;
        surlignerJoursPrevisualisation(debut, fin);
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        dragStartDate = null;
        calculerDureeAbsence();
    });
}

async function chargerCalendrier() {
    await chargerJoursFeries();
    await chargerAbsences();
    genererCalendrier();
    initCalendrierDragSelect();
}

// ========== GESTION DU FORMULAIRE D'ABSENCE ==========

async function initFormAbsence() {
    try {
        const salarie = await window.api.getSalarie(user.id);
        const typeAbsenceSelect = document.getElementById('typeAbsence');
        
        // Ajouter Récup si le salarié y a droit (ordre alpha : CP, Récup, RTT)
        if (salarie.a_droit_recup === 1) {
            const optionRecup = document.createElement('option');
            optionRecup.value = 'RECUP';
            optionRecup.textContent = 'Récupération';
            typeAbsenceSelect.appendChild(optionRecup);
        }

        // Ajouter RTT si le salarié y a droit
        if (salarie.a_droit_rtt === 1) {
            const optionRTT = document.createElement('option');
            optionRTT.value = 'RTT';
            optionRTT.textContent = 'RTT';
            typeAbsenceSelect.appendChild(optionRTT);
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
    document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));
    if (!dateDebut || !dateFin) return;
    document.querySelectorAll('.jour[data-date]').forEach(jourDiv => {
        if (jourDiv.dataset.date >= dateDebut && jourDiv.dataset.date <= dateFin) {
            jourDiv.classList.add('preview');
        }
    });
}

// ========== VALIDATION BOUTON VALIDER ==========

function updateBtnValider() {
    const btn = document.getElementById('btnValider');
    const wrapper = document.getElementById('btnSubmitWrapper');
    const type = document.getElementById('typeAbsence').value;
    const dateDebut = document.getElementById('dateDebut').value;
    const dateFin = document.getElementById('dateFin').value;
    const recupType = document.getElementById('recupType').value;
    const recupHeures = document.getElementById('recupHeures').value;

    const manquants = [];
    if (!type) manquants.push('type d\'absence');
    if (!dateDebut || !dateFin) manquants.push('dates');
    if (dateDebut && dateFin && dateFin < dateDebut) manquants.push('date de fin antérieure au début');
    const resumeBox = document.getElementById('resumeAbsence');
    if (dateDebut && dateFin && dateFin >= dateDebut && type && resumeBox && resumeBox.style.display === 'none') {
        manquants.push('aucun jour ouvré dans cette période');
    }
    if (type === 'RECUP' && recupType === 'heures' && (!recupHeures || recupHeures <= 0)) {
        manquants.push('nombre d\'heures');
    }
    if (hasChevauchement) {
        manquants.push('chevauchement avec une absence existante');
    }

    if (manquants.length > 0) {
        btn.disabled = true;
        wrapper.dataset.tooltip = 'Manquant : ' + manquants.join(', ');
    } else {
        btn.disabled = false;
        delete wrapper.dataset.tooltip;
    }
}

// Fonction de calcul (extraite pour être réutilisable)
async function calculerDureeAbsence() {
    const typeAbsence = document.getElementById('typeAbsence').value;
    const dateDebut = document.getElementById('dateDebut').value;
    const dateFin = document.getElementById('dateFin').value;
    const debutPeriode = document.getElementById('debutAprem').value === 'pm' ? 'apres-midi' : 'matin';
    const finPeriode = document.getElementById('finMidi').value === 'am' ? 'midi' : 'fin-journee';
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
        updateBtnValider();
        return;
    }
    
    if (new Date(dateDebut) > new Date(dateFin)) {
        resumeBox.style.display = 'none';
        updateBtnValider();
        return;
    }

    try {
    let dureeJours = 0;
    let dureeHeures = 0;

    // Calculer la durée d'abord
    const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
    dureeJours = result.dureeJours;
    dureeHeures = dureeJours * 7;

    // Bloquer si durée = 0 (jour férié, weekend...)
    if (dureeJours <= 0) {
        alertePeriode.textContent = '⚠️ Aucun jour ouvré dans cette période (jour férié ou weekend)';
        alertePeriode.classList.add('show', 'alert-warning');
        resumeBox.style.display = 'none';
        updateBtnValider();
        return;
    }

    // Afficher la durée
    document.getElementById('resumeDuree').textContent = `${dureeJours.toFixed(2)} j`;

    // Surligner les jours dans le calendrier
    surlignerJoursPrevisualisation(dateDebut, dateFin);

    // Vérifier les chevauchements avec les absences existantes (valides + en attente)
    const chevauchement = absences.find(abs => {
        if (abs.statut !== 'valide' && abs.statut !== 'en_attente') return false;
        return (dateDebut <= abs.date_fin && dateFin >= abs.date_debut);
    });

    hasChevauchement = !!chevauchement;

    if (chevauchement) {
        const typeTexte = {
            'CP_N': 'CP',
            'CP_N1': 'CP N-1',
            'RTT': 'RTT',
            'RECUP': 'Récupération',
            'MALADIE': 'Arrêt maladie'
        }[chevauchement.type] || chevauchement.type;
        const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
        const suffixe = chevauchement.statut === 'en_attente' ? ' (en attente)' : '';
        alertePeriode.textContent = `⚠️ Chevauchement avec ${typeTexte}${suffixe} du ${fmtDate(chevauchement.date_debut)} au ${fmtDate(chevauchement.date_fin)}`;
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
        
        const resumeDecompteEl = document.getElementById('resumeDecompte');

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

            resumeDecompteEl.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>CP N-1</strong></td><td>${decompteCP_N1.toFixed(1)}j</td><td>${nouveauCP_N1.toFixed(1)}j</td></tr>
                <tr><td><strong>CP N</strong></td><td>${decompteCP_N.toFixed(1)}j</td><td style="color:${nouveauCP_N < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauCP_N.toFixed(1)}j</td></tr>
            </table>`;

            if (nouveauCP_N < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauCP_N).toFixed(1)}j`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = '✓ Solde suffisant';
            }

        } else if (typeAbsence === 'RTT') {
            const nouveauRTT = soldes.rtt - dureeJours;
            resumeDecompteEl.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>RTT</strong></td><td>${dureeJours.toFixed(1)}j</td><td style="color:${nouveauRTT < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauRTT.toFixed(1)}j</td></tr>
            </table>`;

            if (nouveauRTT < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRTT).toFixed(1)}j`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = '✓ Solde suffisant';
            }

        } else if (typeAbsence === 'RECUP') {
            const nouveauRecup = soldes.recup_heures - dureeHeures;
            resumeDecompteEl.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>Récup</strong></td><td>${dureeHeures.toFixed(1)}h</td><td style="color:${nouveauRecup < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauRecup.toFixed(1)}h</td></tr>
            </table>`;

            if (nouveauRecup < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRecup).toFixed(1)}h`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = '✓ Solde suffisant';
            }

        } else if (typeAbsence === 'MALADIE') {
            resumeDecompteEl.textContent = 'Pas de décompte';
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
        
        resumeBox.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur lors du calcul:', error);
        errorMessage.textContent = 'Erreur lors du calcul';
        errorMessage.classList.add('show');
        resumeBox.style.display = 'none';
    }
    updateBtnValider();
}

// Calculer automatiquement quand les champs changent
document.getElementById('typeAbsence').addEventListener('change', () => { calculerDureeAbsence(); updateBtnValider(); });
document.getElementById('dateDebut').addEventListener('change', calculerDureeAbsence);
document.getElementById('dateFin').addEventListener('change', calculerDureeAbsence);
// Toggle AM/PM buttons
document.querySelectorAll('#mes-conges-section .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const toggle = btn.closest('.period-toggle');
        toggle.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(target).value = btn.dataset.value;
        calculerDureeAbsence();
    });
});
document.getElementById('recupType').addEventListener('change', () => { calculerDureeAbsence(); updateBtnValider(); });
document.getElementById('recupHeures').addEventListener('input', () => { calculerDureeAbsence(); updateBtnValider(); });


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
    const debutPeriode = document.getElementById('debutAprem').value === 'pm' ? 'apres-midi' : 'matin';
    const finPeriode = document.getElementById('finMidi').value === 'am' ? 'midi' : 'fin-journee';
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
            commentaire: commentaire || null,
            debut_periode: debutPeriode,
            fin_periode: finPeriode
        };
        
        const resultAbsence = await window.api.createAbsence(absenceData);

        if (resultAbsence.success) {
            // Si la demande est en attente, on ne débite PAS les soldes et on ne génère PAS de PDF.
            // Le débit et le PDF seront faits par l'admin au moment de la validation.
            if (resultAbsence.statut === 'en_attente') {
                await loadSoldes();
                await chargerAbsences();
                genererCalendrier();

                successMessage.textContent = '✅ Demande envoyée — en attente de validation par l\'administrateur.';
                successMessage.classList.add('show');

                document.getElementById('formAbsence').reset();
                document.getElementById('resumeAbsence').style.display = 'none';
                document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));

                setTimeout(() => successMessage.classList.remove('show'), 4000);
                return;
            }

            // Statut 'valide' : débit solde + PDF (cas admin ou pose auto-validée)
            const resultSoldes = await window.api.updateSoldesAfterAbsence(
                user.id,
                anneeActuelle,
                typeAbsence,
                dureeJours,
                dureeHeures
            );

            const pdfData = {
                salarie: {
                    nom: user.nom,
                    prenom: user.prenom,
                    role: 'user'
                },
                absence: {
                    type: typeToSave,
                    date_debut: dateDebut,
                    date_fin: dateFin,
                    duree_jours: typeAbsence === 'RECUP' && recupType === 'heures' ? null : dureeJours,
                    duree_heures: typeAbsence === 'RECUP' ? dureeHeures : null,
                    commentaire: commentaire || null
                },
                soldes: {
                    cp_n1: resultSoldes.cp_n1,
                    cp_n: resultSoldes.cp_n,
                    rtt: resultSoldes.rtt,
                    recup_heures: resultSoldes.recup_heures
                }
            };

            try {
                const pdfResult = await window.api.genererPDF(pdfData);
                if (pdfResult.success) {
                    console.log('PDF généré :', pdfResult.filePath);
                }
            } catch (error) {
                console.error('Erreur génération PDF:', error);
            }

            await loadSoldes();
            await chargerCalendrier();

            successMessage.textContent = '✅ Absence enregistrée avec succès ! PDF généré.';
            successMessage.classList.add('show');

            document.getElementById('formAbsence').reset();
            document.getElementById('resumeAbsence').style.display = 'none';
            document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));

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

    // Afficher au chargement les notifs workflow non lues (validation/refus reçus en absence du user)
    const _idsNotifsVues = new Set();
    try {
        const initNotifs = await window.api.getNotificationsNonLues(user.id);
        for (const notif of (initNotifs || [])) {
            if ((notif.type === 'demande_validee' || notif.type === 'demande_refusee') && !_idsNotifsVues.has(notif.id)) {
                afficherToastUser(notif);
                _idsNotifsVues.add(notif.id);
            } else {
                _idsNotifsVues.add(notif.id);
            }
        }
    } catch (e) { console.error('[INIT NOTIFS]', e); }

    // Polling toutes les 30s pour détecter les changements depuis d'autres postes
    // (validation/refus admin, autres poses, traitements auto)
    setInterval(async () => {
        try {
            await loadSoldes();
            await chargerAbsences();
            genererCalendrier();

            const calGlobal = document.getElementById('calendrier-global-section');
            if (calGlobal && calGlobal.classList.contains('active')) {
                await chargerCalendrierGlobal();
            }

            // Détecter nouvelles notifications (par id jamais vu) → toast pour les types workflow
            const notifs = await window.api.getNotificationsNonLues(user.id);
            for (const notif of (notifs || [])) {
                if (_idsNotifsVues.has(notif.id)) continue;
                _idsNotifsVues.add(notif.id);
                if (notif.type === 'demande_validee' || notif.type === 'demande_refusee') {
                    afficherToastUser(notif);
                }
            }
        } catch (e) {
            console.error('[POLLING] Erreur:', e);
        }
    }, 30000);
}

// ========== TOAST (workflow validation) — même structure que côté admin ==========
const _toastQueueUser = [];
let _toastActifUser = false;

function afficherToastUser(notif) {
    _toastQueueUser.push(notif);
    _afficherProchainToastUser();
}

function _afficherProchainToastUser() {
    if (_toastActifUser || _toastQueueUser.length === 0) return;
    _toastActifUser = true;
    const notif = _toastQueueUser.shift();

    const type = notif.statut === 'success' ? 'success' : 'error';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    const titre = (notif.titre || '').replace(/[<>]/g, '');
    const message = (notif.message || '').replace(/[<>]/g, '');

    const toast = document.createElement('div');
    toast.className = `notification-persistante ${type}`;
    toast.innerHTML = `
        <div class="notification-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="notification-content">
            <h4>${titre}</h4>
            <p>${message}</p>
        </div>
        <button class="notification-close"><i class="fa-solid fa-times"></i></button>
    `;

    document.body.appendChild(toast);

    let dismissed = false;
    const dismiss = async () => {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(autoDismissTimer);
        if (notif.id) {
            try { await window.api.marquerNotificationLue(notif.id); } catch (e) { /* */ }
        }
        toast.remove();
        _toastActifUser = false;
        _afficherProchainToastUser();
    };

    const autoDismissTimer = setTimeout(dismiss, 5000);
    toast.querySelector('.notification-close').addEventListener('click', dismiss);
}

// Écouter les notifs temps réel envoyées par le main process (workflow validation)
if (window.api.onTraitementAutomatique) {
    window.api.onTraitementAutomatique(async (data) => {
        if ((data.type === 'demande_validee' || data.type === 'demande_refusee') && data.user_id === user.id) {
            afficherToastUser({ id: null, titre: data.titre, message: data.message, statut: data.statut });
            try {
                await loadSoldes();
                await chargerAbsences();
                genererCalendrier();
            } catch (e) { /* ignorer */ }
        }
    });
}

init();