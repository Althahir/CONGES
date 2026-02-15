// Récupérer les infos utilisateur
const user = JSON.parse(sessionStorage.getItem('user'));

// Si pas d'utilisateur ou pas admin, rediriger
if (!user) {
    window.location.href = 'login.html';
} else if (user.role !== 'admin') {
    window.location.href = 'dashboard-user.html';
}

// Afficher le nom de l'utilisateur
document.getElementById('userName').textContent = `${user.prenom} ${user.nom}`;

// Variables globales
let anneeCalendrier = new Date().getFullYear();

// ========== NAVIGATION ENTRE SECTIONS ==========

const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.content-section');

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Retirer active de tous
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        
        // Ajouter active au cliqué
        btn.classList.add('active');
        
        const sectionName = btn.getAttribute('data-section');
        document.getElementById(`${sectionName}-section`).classList.add('active');
        
        // Charger les données selon la section
        switch(sectionName) {
            case 'mes-conges':
                initMesConges();
                break;
            case 'salaries':
                chargerSalaries();
                break;
            case 'calendrier':
                console.log('Chargement calendrier global...');
                chargerCalendrierGlobal();
                break;
            case 'feries':
                chargerJoursFeries();
                break;
            case 'rtt':
                chargerTableauRTT();
                break;
        }
    });
});

// ========== GESTION DES SALARIÉS ==========

async function chargerSalaries() {
    try {
        const salaries = await window.api.getAllSalaries();
        const container = document.getElementById('listeSalaries');
        
        if (salaries.length === 0) {
            container.innerHTML = '<p class="text-muted">Aucun salarié</p>';
            return;
        }
        
        // Pour chaque salarié, récupérer ses soldes
        const cards = await Promise.all(salaries.map(async (salarie) => {
            const annee = new Date().getFullYear();
            const soldes = await window.api.getSoldes(salarie.id, annee);
            
            return `
                <div class="salarie-card">
                    <div class="salarie-header">
                        <div class="salarie-nom">${salarie.prenom} ${salarie.nom}</div>
                        <div class="salarie-badge ${salarie.role === 'admin' ? 'admin' : ''}">${salarie.role}</div>
                    </div>
                    <div class="salarie-info">
                        📧 ${salarie.email}<br>
                        📅 Embauché le ${new Date(salarie.date_embauche).toLocaleDateString('fr-FR')}
                    </div>
                    <div class="salarie-info">
                        CP/mois: ${salarie.cp_mensuel.toFixed(2)}j | 
                        RTT: ${salarie.a_droit_rtt ? '✅' : '❌'} | 
                        Récup: ${salarie.a_droit_recup ? '✅' : '❌'}
                    </div>
                    ${soldes ? `
                        <div class="salarie-soldes">
                            <div class="solde-mini">
                                <div class="solde-mini-label">CP N-1</div>
                                <div class="solde-mini-value">${soldes.cp_n1.toFixed(2)}j</div>
                            </div>
                            <div class="solde-mini">
                                <div class="solde-mini-label">CP N</div>
                                <div class="solde-mini-value">${soldes.cp_n.toFixed(2)}j</div>
                            </div>
                            <div class="solde-mini">
                                <div class="solde-mini-label">RTT</div>
                                <div class="solde-mini-value">${soldes.rtt.toFixed(2)}j</div>
                            </div>
                            <div class="solde-mini">
                                <div class="solde-mini-label">Récup</div>
                                <div class="solde-mini-value">${soldes.recup_heures.toFixed(1)}h</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }));
        
        container.innerHTML = cards.join('');
        
    } catch (error) {
        console.error('Erreur chargement salariés:', error);
    }
}

// ========== CALENDRIER GLOBAL ==========

document.getElementById('anneeCalendrier').textContent = anneeCalendrier;

document.getElementById('btnPrevYearCal').addEventListener('click', () => {
    anneeCalendrier--;
    document.getElementById('anneeCalendrier').textContent = anneeCalendrier;
    chargerCalendrierGlobal();
});

document.getElementById('btnNextYearCal').addEventListener('click', () => {
    anneeCalendrier++;
    document.getElementById('anneeCalendrier').textContent = anneeCalendrier;
    chargerCalendrierGlobal();
});

async function chargerCalendrierGlobal() {
    console.log('=== DÉBUT chargerCalendrierGlobal ===');
    try {
        const container = document.getElementById('calendrierGlobal');
        console.log('Container trouvé:', container);
        // Récupérer tous les salariés et toutes les absences
        const salaries = await window.api.getAllSalaries();
        console.log('Salariés:', salaries);
        const toutesAbsences = await window.api.getAllAbsences();
        console.log('Toutes absences:', toutesAbsences);
        const joursFeries = await window.api.getJoursFeries(anneeCalendrier);
        console.log('Jours fériés:', joursFeries);
        // Filtrer les absences pour l'année sélectionnée
        const absencesAnnee = toutesAbsences.filter(abs => {
            const annee = new Date(abs.date_debut).getFullYear();
            return annee === anneeCalendrier;
        });
        
        // Créer une couleur par salarié (couleurs de l'asso en priorité)
        const couleursSalaries = {};
        const couleursDisponibles = [
            'rgb(0, 108, 137)', 
            'rgb(116, 43, 135)', 
            'rgb(181, 22, 63)',   // Bleu
            'rgb(237, 113, 17)',   // Orange
            'rgb(249, 198, 73)',   // Jaune
            // Couleurs supplémentaires si besoin
            '#10B981',             // Vert
            '#8B5CF6',             // Violet
            '#EC4899',             // Rose
            '#14B8A6',             // Turquoise
            '#06B6D4',             // Cyan
            '#84CC16'              // Lime
        ];
        
        
        salaries.forEach((sal, index) => {
            couleursSalaries[sal.id] = couleursDisponibles[index % couleursDisponibles.length];
        });
        
        // Générer le calendrier
        container.innerHTML = `
            <div class="legende-salaries">
                ${salaries.map(sal => `
                    <div class="legende-salarie">
                        <span class="legende-color" style="background: ${couleursSalaries[sal.id]}"></span>
                        <span>${sal.prenom} ${sal.nom}</span>
                    </div>
                `).join('')}
            </div>
            <div class="calendrier-grid-global" id="calendrierGridGlobal"></div>
        `;
        
        const calendrierGrid = document.getElementById('calendrierGridGlobal');
        console.log('calendrierGrid trouvé:', calendrierGrid);
        const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const nomsJoursCourts = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
        
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
            
            const premierJour = new Date(anneeCalendrier, mois, 1);
            const dernierJour = new Date(anneeCalendrier, mois + 1, 0);
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
                const annee = anneeCalendrier;
                const dateISO = `${annee}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
                const date = new Date(annee, mois, jour);
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
                    const ferie = joursFeries.find(f => f.date === dateISO);
                    jourDiv.setAttribute('data-tooltip', ferie.libelle);
                }
                
                // Absences - chercher toutes les absences pour ce jour
                const absencesJour = absencesAnnee.filter(abs => {
                    return dateISO >= abs.date_debut && dateISO <= abs.date_fin;
                });
                
                if (absencesJour.length > 0) {
                    // S'il y a plusieurs absences, afficher des barres colorées
                    if (absencesJour.length === 1) {
                        const abs = absencesJour[0];
                        jourDiv.style.background = couleursSalaries[abs.salarie_id];
                        jourDiv.style.color = 'white';
                        jourDiv.style.fontWeight = 'bold';
                        jourDiv.setAttribute('data-tooltip', `${abs.prenom} ${abs.nom}`);
                    } else {
                        // Plusieurs absences : afficher des barres
                        jourDiv.classList.add('multi-absences');
                        const barres = absencesJour.map(abs => 
                            `<div class="barre-absence" style="background: ${couleursSalaries[abs.salarie_id]}"></div>`
                        ).join('');
                        jourDiv.innerHTML = `<span>${jour}</span><div class="barres-container">${barres}</div>`;
                        
                        const noms = absencesJour.map(abs => `${abs.prenom} ${abs.nom}`).join(', ');
                        jourDiv.setAttribute('data-tooltip', noms);
                    }
                }
                
                joursMoisDiv.appendChild(jourDiv);
            }
            
            moisDiv.appendChild(joursMoisDiv);
            calendrierGrid.appendChild(moisDiv);
            console.log('=== FIN génération calendrier, nombre de mois ajoutés:', calendrierGrid.children.length);
        }
        
    } catch (error) {
    console.error('Erreur chargement calendrier global:', error);
}
}

// ========== JOURS FÉRIÉS ==========

async function chargerJoursFeries() {
    try {
        const annee = new Date().getFullYear();
        const feries = await window.api.getJoursFeries(annee);
        const container = document.getElementById('listeFeries');
        
        if (feries.length === 0) {
            container.innerHTML = '<p class="text-muted">Aucun jour férié enregistré</p>';
            return;
        }
        
        const html = feries.map(f => `
            <div class="ferie-item">
                <div class="ferie-date">${new Date(f.date).toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                })}</div>
                <div class="ferie-libelle">${f.libelle}</div>
            </div>
        `).join('');
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Erreur chargement jours fériés:', error);
    }
}

// ========== TABLE RTT ==========

async function chargerTableauRTT() {
    const container = document.getElementById('tableRTT');
    container.innerHTML = '<p>Tableau RTT annuels - En cours de développement...</p>';
    // TODO: Afficher le tableau des RTT annuels
}

// ========== BOUTONS ==========

document.getElementById('btnAjouterSalarie').addEventListener('click', () => {
    alert('Fonctionnalité "Ajouter un salarié" à implémenter');
});

document.getElementById('btnAjouterFerie').addEventListener('click', () => {
    alert('Fonctionnalité "Ajouter un jour férié" à implémenter');
});

// Bouton déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});

// ========== SECTION MES CONGÉS (reprise du dashboard user) ==========

let anneeActuelle = new Date().getFullYear();
let joursFeriesUser = [];
let absencesUser = [];

async function initMesConges() {
    await loadSoldesAdmin();
    await initFormAbsenceAdmin();
    await chargerCalendrierUser();
    await afficherHistoriqueAdmin();
}

// Charger les soldes de l'admin
async function loadSoldesAdmin() {
    try {
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        if (soldes) {
            document.getElementById('solde-cp-n1-user').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n-user').textContent = soldes.cp_n.toFixed(2) + 'j';
            document.getElementById('solde-rtt-user').textContent = soldes.rtt.toFixed(2) + 'j';
            
            const recupJours = Math.floor(soldes.recup_heures / 7);
            const recupHeuresRestantes = (soldes.recup_heures % 7).toFixed(1);
            document.getElementById('solde-recup-user').innerHTML = 
                `${soldes.recup_heures.toFixed(1)}h<br><small style="font-size: 0.7em;">(${recupJours}j ${recupHeuresRestantes}h)</small>`;
        }
    } catch (error) {
        console.error('Erreur chargement soldes:', error);
    }
}

async function chargerJoursFeriesUser() {
    try {
        joursFeriesUser = await window.api.getJoursFeries(anneeActuelle);
    } catch (error) {
        console.error('Erreur chargement jours fériés:', error);
        joursFeriesUser = [];
    }
}

async function chargerAbsencesUser() {
    try {
        absencesUser = await window.api.getAbsences(user.id);
        absencesUser = absencesUser.filter(abs => {
            const annee = new Date(abs.date_debut).getFullYear();
            return annee === anneeActuelle;
        });
    } catch (error) {
        console.error('Erreur chargement absences:', error);
        absencesUser = [];
    }
}

function genererCalendrierUser() {
    const calendrierContainer = document.getElementById('calendrierAnnuelUser');
    if (!calendrierContainer) return;
    
    calendrierContainer.innerHTML = '';
    
    const nomsJoursCourts = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    for (let mois = 0; mois < 12; mois++) {
        const moisDiv = document.createElement('div');
        moisDiv.className = 'mois-calendrier';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'mois-header';
        headerDiv.textContent = nomsMois[mois];
        moisDiv.appendChild(headerDiv);
        
        const joursSemaineDiv = document.createElement('div');
        joursSemaineDiv.className = 'jours-semaine';
        nomsJoursCourts.forEach(jour => {
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour-semaine';
            jourDiv.textContent = jour;
            joursSemaineDiv.appendChild(jourDiv);
        });
        moisDiv.appendChild(joursSemaineDiv);
        
        const joursMoisDiv = document.createElement('div');
        joursMoisDiv.className = 'jours-mois';
        
        const premierJour = new Date(anneeActuelle, mois, 1);
        const dernierJour = new Date(anneeActuelle, mois + 1, 0);
        const nbJours = dernierJour.getDate();
        const premierJourSemaine = premierJour.getDay();
        
        for (let i = 0; i < premierJourSemaine; i++) {
            const jourVide = document.createElement('div');
            jourVide.className = 'jour vide';
            joursMoisDiv.appendChild(jourVide);
        }
        
        for (let jour = 1; jour <= nbJours; jour++) {
            const dateISO = `${anneeActuelle}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            const date = new Date(anneeActuelle, mois, jour);
            const dayOfWeek = date.getDay();
            
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour';
            jourDiv.textContent = jour;
            
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                jourDiv.classList.add('weekend');
            }
            
            const jourFerie = joursFeriesUser.find(f => f.date === dateISO);
            if (jourFerie) {
                jourDiv.classList.add('ferie');
                jourDiv.setAttribute('data-tooltip', jourFerie.libelle);
            }
            
            const absence = absencesUser.find(abs => {
                return dateISO >= abs.date_debut && dateISO <= abs.date_fin;
            });
            
            if (absence) {
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

async function chargerCalendrierUser() {
    await chargerJoursFeriesUser();
    await chargerAbsencesUser();
    genererCalendrierUser();
}

async function initFormAbsenceAdmin() {
    try {
        const salarie = await window.api.getSalarie(user.id);
        const typeAbsenceSelect = document.getElementById('typeAbsenceUser');
        
        if (!typeAbsenceSelect) return;
        
        if (salarie.a_droit_rtt === 1) {
            const existingRTT = Array.from(typeAbsenceSelect.options).find(opt => opt.value === 'RTT');
            if (!existingRTT) {
                const optionRTT = document.createElement('option');
                optionRTT.value = 'RTT';
                optionRTT.textContent = 'RTT';
                typeAbsenceSelect.insertBefore(optionRTT, typeAbsenceSelect.lastElementChild);
            }
        }
        
        if (salarie.a_droit_recup === 1) {
            const existingRecup = Array.from(typeAbsenceSelect.options).find(opt => opt.value === 'RECUP');
            if (!existingRecup) {
                const optionRecup = document.createElement('option');
                optionRecup.value = 'RECUP';
                optionRecup.textContent = 'Récupération';
                typeAbsenceSelect.insertBefore(optionRecup, typeAbsenceSelect.lastElementChild);
            }
        }
    } catch (error) {
        console.error('Erreur init formulaire:', error);
    }
    
    // Événements formulaire
    const typeSelect = document.getElementById('typeAbsenceUser');
    const recupFields = document.getElementById('recupFieldsUser');
    const recupTypeSelect = document.getElementById('recupTypeUser');
    const recupHeuresGroup = document.getElementById('recupHeuresGroupUser');
    
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            if (recupFields) {
                recupFields.style.display = e.target.value === 'RECUP' ? 'block' : 'none';
            }
        });
    }
    
    if (recupTypeSelect) {
        recupTypeSelect.addEventListener('change', (e) => {
            if (recupHeuresGroup) {
                recupHeuresGroup.style.display = e.target.value === 'heures' ? 'block' : 'none';
                const recupHeuresInput = document.getElementById('recupHeuresUser');
                if (recupHeuresInput) {
                    recupHeuresInput.required = e.target.value === 'heures';
                }
            }
        });
    }
}

async function afficherHistoriqueAdmin() {
    try {
        const historiqueContainer = document.getElementById('historiqueListUser');
        if (!historiqueContainer) return;
        
        const toutesAbsences = await window.api.getAbsences(user.id);
        const dernieresAbsences = toutesAbsences
            .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
            .slice(0, 5);
        
        if (dernieresAbsences.length === 0) {
            historiqueContainer.innerHTML = '<p class="text-muted">Aucune absence enregistrée</p>';
            return;
        }
        
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
        
        historiqueContainer.innerHTML = dernieresAbsences.map(abs => {
            const dateD = new Date(abs.date_debut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const dateF = new Date(abs.date_fin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const duree = abs.duree_jours ? `${abs.duree_jours.toFixed(1)}j` : `${abs.duree_heures.toFixed(1)}h`;
            
            return `
                <div class="historique-item ${typeClasses[abs.type]}">
                    <div class="historique-date">${dateD} - ${dateF}</div>
                    <div class="historique-type">${typeLabels[abs.type]} • ${duree}</div>
                    ${abs.commentaire ? `<div class="historique-duree">${abs.commentaire}</div>` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erreur affichage historique:', error);
    }
}
// ========== INITIALISATION ==========

async function init() {
    await initMesConges(); // ← Ajoute cette ligne
}

init();