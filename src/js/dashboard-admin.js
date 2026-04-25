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
    // Rafraîchir les graphiques si la section stats est active
    donutInitialized = false; // Forcer le recalcul du donut (couleurs dark/light)
    if (document.getElementById('statistiques-section')?.classList.contains('active')) {
        setTimeout(() => chargerStatistiques(), 50);
    }
});

// Variables globales — années par section
let anneeCalendrier = new Date().getFullYear();
let anneeFeries = new Date().getFullYear();
let anneeActuelle = new Date().getFullYear();
let anneeHistorique = new Date().getFullYear();
let sectionActiveAdmin = 'mes-conges';

const titresSectionAdmin = {
    'mes-conges': 'Mes Congés',
    'calendrier': 'Calendrier Global',
    'historique': 'Validation',
    'salaries': 'Salariés',
    'feries': 'Jours Fériés',
    'statistiques': 'Statistiques',
    'parametres': 'Paramètres'
};

// Sections qui utilisent la navigation par année
const sectionsAvecAnnee = ['mes-conges', 'calendrier', 'historique', 'feries', 'statistiques'];
let anneeStatistiques = new Date().getFullYear();

// ========== NAVIGATION ENTRE SECTIONS ==========

const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.content-section');



// Fonction pour obtenir l'année de la section active
function getAnneeSection(sectionName) {
    switch(sectionName) {
        case 'mes-conges': return anneeActuelle;
        case 'calendrier': return anneeCalendrier;
        case 'historique': return anneeHistorique;
        case 'feries': return anneeFeries;
        case 'statistiques': return anneeStatistiques;
        default: return new Date().getFullYear();
    }
}

// Fonction pour mettre à jour l'affichage année dans la nav
function updateYearNavDisplay() {
    const yearNav = document.getElementById('yearNavAdmin');
    const anneeSpan = document.getElementById('anneeAdmin');

    if (sectionsAvecAnnee.includes(sectionActiveAdmin)) {
        yearNav.style.display = 'flex';
        anneeSpan.textContent = getAnneeSection(sectionActiveAdmin);
    } else {
        yearNav.style.display = 'none';
    }
}

// Navigation année centralisée
function changerAnneeAdmin(delta) {
    if (getAnneeSection(sectionActiveAdmin) + delta < 2022) return;
    switch(sectionActiveAdmin) {
        case 'mes-conges':
            anneeActuelle += delta;
            chargerCalendrierUser();
            break;
        case 'calendrier':
            anneeCalendrier += delta;
            chargerCalendrierGlobal();
            break;
        case 'historique':
            anneeHistorique += delta;
            chargerCalendrierHistorique();
            break;
        case 'feries':
            anneeFeries += delta;
            chargerJoursFeries();
            break;
        case 'statistiques':
            anneeStatistiques += delta;
            setTimeout(() => chargerStatistiques(), 50);
            break;
    }
    updateYearNavDisplay();
}

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Retirer active de tous
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        // Ajouter active au cliqué
        btn.classList.add('active');

        const sectionName = btn.getAttribute('data-section');
        sectionActiveAdmin = sectionName;
        document.getElementById(`${sectionName}-section`).classList.add('active');

        // Mettre à jour le titre du header
        document.getElementById('headerTitle').textContent = titresSectionAdmin[sectionName] || 'Administration';

        // Mettre à jour la navigation année
        updateYearNavDisplay();

        // Charger les données selon la section
        switch(sectionName) {
            case 'mes-conges':
                initMesConges();
                break;
            case 'salaries':
                chargerSalaries();
                break;
            case 'calendrier':
                chargerCalendrierGlobal();
                break;
            case 'historique':
                chargerHistoriqueComplet();
                break;
            case 'feries':
                chargerJoursFeries();
                break;
            case 'statistiques':
                setTimeout(() => chargerStatistiques(), 50);
                break;
            case 'parametres':
                chargerParametres();
                chargerTableauRTT();
                break;
            }
    });
});

// ========== EVENT LISTENERS NAVIGATION ANNÉE (TOPBAR) ==========

document.getElementById('btnPrevYearAdmin').addEventListener('click', () => changerAnneeAdmin(-1));
document.getElementById('btnNextYearAdmin').addEventListener('click', () => changerAnneeAdmin(1));

// Initialiser l'affichage année au chargement
updateYearNavDisplay();

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
                        RTT: ${salarie.a_droit_rtt ? '✅' : '❌'} |
                        Récup: ${salarie.a_droit_recup ? '✅' : '❌'}
                        ${salarie.en_arret_maladie ? ' | <span style="color: var(--rouge);">En arrêt maladie</span>' : ''}
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
                    <div class="salarie-actions">
                        <button class="btn-action btn-edit" onclick="editSalarie(${salarie.id})" title="Modifier">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="btn-action btn-pdf" onclick="exporterRecapPDF(${salarie.id})" title="Imprimer récap et soldes">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        <button class="btn-action btn-reset" onclick="resetPassword(${salarie.id}, '${salarie.nom}', '${salarie.prenom}')" title="Réinitialiser mot de passe">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        ${salarie.role !== 'admin' ? `
                            <button class="btn-action btn-delete" onclick="deactivateSalarie(${salarie.id}, '${salarie.nom}', '${salarie.prenom}')" title="Désactiver">
                                <i class="fa-solid fa-user-slash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }));
        
        container.innerHTML = cards.join('');
        
    } catch (error) {
        console.error('Erreur chargement salariés:', error);
    }
}

// ========== EXPORT RÉCAP PDF ==========

async function exporterRecapPDF(salarieId) {
    try {
        const annee = new Date().getFullYear();
        await window.api.exporterRecapPDF({ salarie_id: salarieId, annee });
    } catch (error) {
        console.error('Erreur export récap PDF:', error);
        afficherNotificationPersistante('error', 'Erreur PDF', error.message);
    }
}

// ========== CALENDRIER GLOBAL ==========

// Navigation année calendrier gérée par changerAnneeAdmin()

async function chargerCalendrierGlobal() {
    console.log('=== DÉBUT chargerCalendrierGlobal ===');
    try {
        const container = document.getElementById('calendrierGlobal');
        
        // Récupérer tous les salariés et toutes les absences
        const salaries = await window.api.getAllSalaries();
        const toutesAbsences = await window.api.getAllAbsences();
        const joursFeries = await window.api.getJoursFeries(anneeCalendrier);
        
        // Filtrer les absences pour l'année sélectionnée (inclure celles qui touchent l'année)
        // Filtrer les absences pour l'année sélectionnée (inclure celles qui touchent l'année)
        const absencesAnnee = toutesAbsences.filter(abs => {
            const anneeDebut = new Date(abs.date_debut).getFullYear();
            const anneeFin = new Date(abs.date_fin).getFullYear();
            return anneeDebut === anneeCalendrier || anneeFin === anneeCalendrier;
        });
        
        // Déterminer quels salariés ont au moins une absence cette année
        const salariesAvecAbsences = new Set();
        absencesAnnee.forEach(abs => {
            salariesAvecAbsences.add(abs.salarie_id);
        });
        
        // Filtrer et trier les salariés qui ont des absences (par ordre alphabétique)
        const salariesActifs = salaries
            .filter(sal => salariesAvecAbsences.has(sal.id))
            .sort((a, b) => {
                const nomA = `${a.nom} ${a.prenom}`.toLowerCase();
                const nomB = `${b.nom} ${b.prenom}`.toLowerCase();
                return nomA.localeCompare(nomB);
            });
        
        // Palette de couleurs (8 couleurs max)
        const couleursDisponibles = [
            'rgb(249, 198, 73)',   // 5. Jaune
            'rgb(237, 113, 17)',   // 4. Orange
            'rgb(181, 22, 63)',    // 3. Rouge
            'rgb(116, 43, 135)',   // 2. Mauve
        'rgb(0, 108, 137)',    // 1. Bleu
        '#10B981',             // 6. Vert émeraude
        '#8B5CF6',             // 7. Violet
        '#14B8A6'              // 8. Turquoise
        ];
        
        // Attribuer une couleur et une position à chaque salarié actif
        const couleursSalaries = {};
        const positionsSalaries = {};
        salariesActifs.forEach((sal, index) => {
            couleursSalaries[sal.id] = couleursDisponibles[index % 8];
            positionsSalaries[sal.id] = index % 8; // Position 0-7
        });
        
        // Générer la légende
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
        
        // Générer le tableau
        const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        
        let tableHTML = '<div class="calendrier-lineaire"><table class="calendrier-table">';
        
        // En-tête des mois
        tableHTML += '<thead><tr>';
        nomsMois.forEach(mois => {
            tableHTML += `<th>${mois}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';
        
        // Générer les lignes (jours 1 à 31)
        for (let jour = 1; jour <= 31; jour++) {
            tableHTML += '<tr>';
            
            for (let mois = 0; mois < 12; mois++) {
                // Vérifier si ce jour existe dans ce mois
                const dernierJourDuMois = new Date(anneeCalendrier, mois + 1, 0).getDate();
                
                if (jour > dernierJourDuMois) {
                    // Jour inexistant, cellule vide
                    tableHTML += '<td></td>';
                } else {
                    // Construire la date
                    const dateISO = `${anneeCalendrier}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
                    const date = new Date(anneeCalendrier, mois, jour);
                    const dayOfWeek = date.getDay();
                    
                    // Vérifier si c'est un jour férié
                    const estFerie = joursFeries.some(f => f.date === dateISO);
                    const ferie = joursFeries.find(f => f.date === dateISO);
                    
                    // Vérifier si c'est un weekend
                    const estWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    // Trouver tous les absents ce jour (en excluant les jours chômés)
                    const absentsJour = absencesAnnee.filter(abs => {
                        return dateISO >= abs.date_debut && dateISO <= abs.date_fin;
                    });
                                        // Classes CSS
                    let cellClass = '';
                    if (estFerie) cellClass += 'jour-ferie ';
                    if (estWeekend) cellClass += 'jour-weekend ';
                    
                    // Tooltip
                    let tooltip = '';
                    if (estFerie) {
                        tooltip = ferie.libelle;
                    }
                    if (absentsJour.length > 0) {
                        const noms = absentsJour.map(abs => `${abs.prenom} ${abs.nom}`).join(', ');
                        tooltip = tooltip ? `${tooltip} - ${noms}` : noms;
                    }
                    // Si c'est un weekend ou jour férié, ne pas afficher d'absences
                    if (estWeekend || estFerie) {
                        tableHTML += `<td class="${cellClass}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>`;
                        
                        // Calculer la lettre du jour
                        const lettresJours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                        let jourSemaineIndex = dayOfWeek - 1;
                        if (jourSemaineIndex === -1) jourSemaineIndex = 6;
                        const lettreJour = lettresJours[jourSemaineIndex];

                        const jourCellClass = estFerie ? 'jour-cell jour-ferie-cell' : 'jour-cell';
                        tableHTML += `<div class="${jourCellClass}">`;
                        tableHTML += `<span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span>`;
                        tableHTML += '<div class="indicateurs-wrapper">';
    
                        // 8 colonnes vides
                        for (let i = 0; i < 8; i++) {
                            tableHTML += '<div class="indicateur-colonne"></div>';
                        }
    
                        tableHTML += '</div>'; // fin indicateurs-wrapper
    
                        if (estFerie) {
                            tableHTML += '<span class="drapeau-ferie">🚩</span>';
                        }
    
                        tableHTML += '</div></td>'; // fin jour-cell et td
                        continue; // Passer au jour suivant
                    }
                                        
                    tableHTML += `<td class="${cellClass}">`;

                    {
                        // Calculer la lettre du jour de la semaine (format français : L-D)
                        const lettresJours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                        let jourSemaineIndex = dayOfWeek - 1;
                        if (jourSemaineIndex === -1) jourSemaineIndex = 6;
                        const lettreJour = lettresJours[jourSemaineIndex];
                        const jourCellClass = estFerie ? 'jour-cell jour-ferie-cell' : 'jour-cell';
                        tableHTML += `<div class="${jourCellClass}">`;
                        tableHTML += `<span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span>`;
                        tableHTML += '<div class="indicateurs-wrapper">';

                        // Compter les absents uniques ce jour
                        const nbAbsents = new Set(absentsJour.map(a => a.salarie_id)).size;

                        if (nbAbsents >= 8) {
                            // Mode dégradé avec compteur — tooltip avec tous les noms
                            const nomsUniques = [...new Set(absentsJour.map(a => {
                                const suffixe = a.statut === 'en_attente' ? ' (en attente)' : '';
                                return `${a.prenom} ${a.nom}${suffixe}`;
                            }))];
                            const tooltipDegrade = nomsUniques.join(', ');
                            tableHTML += `<div class="indicateur-degrade" data-tooltip="${tooltipDegrade}">${nbAbsents}</div>`;
                        } else {
                            // Mode indicateurs individuels — tooltip par couleur
                            const indicateurs = new Array(8).fill(null);
                            const nomsSalaries = new Array(8).fill(null);
                            const statutsIndicateurs = new Array(8).fill(null);
                            absentsJour.forEach(abs => {
                                const position = positionsSalaries[abs.salarie_id];
                                if (position !== undefined && position < 8) {
                                    indicateurs[position] = couleursSalaries[abs.salarie_id];
                                    nomsSalaries[position] = `${abs.prenom} ${abs.nom}`;
                                    statutsIndicateurs[position] = abs.statut;
                                }
                            });

                            indicateurs.forEach((couleur, idx) => {
                                if (couleur) {
                                    const enAttente = statutsIndicateurs[idx] === 'en_attente';
                                    const classeAttente = enAttente ? ' en-attente' : '';
                                    const suffixe = enAttente ? ' (en attente)' : '';
                                    tableHTML += `<div class="indicateur-colonne actif${classeAttente}" style="background: ${couleur};" data-tooltip="${nomsSalaries[idx]}${suffixe}"></div>`;
                                } else {
                                    tableHTML += '<div class="indicateur-colonne"></div>';
                                }
                            });
                        }
                        
                        tableHTML += '</div>'; // fin indicateurs-wrapper
                        
                        // Ajouter le drapeau pour les jours fériés (à droite)
                        if (estFerie) {
                            tableHTML += '<span class="drapeau-ferie">🚩</span>';
                        }
                        
                        tableHTML += '</div>'; // fin jour-cell
                    
                    }
                    
                    tableHTML += '</td>';
                }
            }
            
            tableHTML += '</tr>';
        }
        
        tableHTML += '</tbody></table></div>';
        
        // Injecter dans le DOM
        container.innerHTML = legendeHTML + tableHTML;
        
    } catch (error) {
        console.error('Erreur chargement calendrier global:', error);
    }
}

// ========== JOURS FÉRIÉS ==========

// Navigation année fériés gérée par changerAnneeAdmin()

// Calcul de la date de Pâques (algorithme de Meeus/Jones/Butcher)
function calculerPaques(annee) {
    const a = annee % 19;
    const b = Math.floor(annee / 100);
    const c = annee % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31);
    const jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour);
}

function getFeriesLegaux(annee) {
    const paques = calculerPaques(annee);
    const jourMs = 24 * 60 * 60 * 1000;
    const lundiPaques = new Date(paques.getTime() + 1 * jourMs);
    const lundiPentecote = new Date(paques.getTime() + 50 * jourMs);

    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const j = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${j}`;
    };

    return [
        { date: `${annee}-01-01`, libelle: "Jour de l'An" },
        { date: fmt(lundiPaques), libelle: 'Lundi de Pâques' },
        { date: `${annee}-05-01`, libelle: 'Fête du Travail' },
        { date: `${annee}-05-08`, libelle: 'Victoire 1945' },
        { date: fmt(lundiPentecote), libelle: 'Lundi de Pentecôte' },
        { date: `${annee}-07-14`, libelle: 'Fête Nationale' },
        { date: `${annee}-08-15`, libelle: 'Assomption' },
        { date: `${annee}-11-01`, libelle: 'Toussaint' },
        { date: `${annee}-11-11`, libelle: 'Armistice 1918' },
        { date: `${annee}-12-25`, libelle: 'Noël' }
    ];
}

async function genererFeriesLegaux(annee) {
    const legaux = getFeriesLegaux(annee);
    const existants = await window.api.getJoursFeries(annee);
    const datesExistantes = existants.map(f => f.date);
    let ajoutes = 0;

    for (const ferie of legaux) {
        if (!datesExistantes.includes(ferie.date)) {
            await window.api.addJourFerie({ date: ferie.date, libelle: ferie.libelle, annee });
            ajoutes++;
        }
    }
    return ajoutes;
}

async function chargerJoursFeries() {
    try {
        const annee = anneeFeries;
        const feries = await window.api.getJoursFeries(annee);
        const container = document.getElementById('listeFeries');

        if (feries.length === 0) {
            container.innerHTML = `
                <div class="feries-vide">
                    <p class="text-muted">Aucun jour férié enregistré pour ${annee}</p>
                    <button id="btnGenererFeries" class="btn-primary">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Générer les ${getFeriesLegaux(annee).length} fériés légaux
                    </button>
                </div>`;
            document.getElementById('btnGenererFeries').addEventListener('click', async () => {
                const btn = document.getElementById('btnGenererFeries');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Génération...';
                const nb = await genererFeriesLegaux(annee);
                chargerJoursFeries();
            });
            return;
        }

        container.innerHTML = feries.map(f => `
            <div class="ferie-item" data-id="${f.id}">
                <div class="ferie-date">${new Date(f.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                })}</div>
                <div class="ferie-libelle">${f.libelle}</div>
                <button class="btn-supprimer-ferie" data-id="${f.id}" title="Supprimer">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        container.querySelectorAll('.btn-supprimer-ferie').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Supprimer ce jour férié ?')) return;
                try {
                    await window.api.deleteJourFerie(parseInt(btn.dataset.id));
                    chargerJoursFeries();
                } catch (err) {
                    console.error('Erreur suppression jour férié:', err);
                }
            });
        });

    } catch (error) {
        console.error('Erreur chargement jours fériés:', error);
    }
}

// Modale jours fériés
(function() {
    const modal  = document.getElementById('modalFerie');
    const form   = document.getElementById('formFerie');
    const erreur = document.getElementById('ferieMsgErreur');

    function ouvrirModal() {
        form.reset();
        erreur.style.display = 'none';
        modal.style.display = 'flex';
    }
    function fermerModal() {
        modal.style.display = 'none';
    }

    document.getElementById('btnAjouterFerie').addEventListener('click', ouvrirModal);
    document.getElementById('closeFerieModal').addEventListener('click', fermerModal);
    document.getElementById('btnAnnulerFerie').addEventListener('click', fermerModal);
    // Fermeture au clic extérieur désactivée

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date    = document.getElementById('ferieDate').value;
        const libelle = document.getElementById('ferieLibelle').value.trim();

        if (!date || !libelle) return;

        const btn = document.getElementById('btnSauvegarderFerie');
        btn.disabled = true;
        erreur.style.display = 'none';

        try {
            await window.api.addJourFerie({ date, libelle, annee: anneeFeries });
            fermerModal();
            chargerJoursFeries();
        } catch (err) {
            erreur.textContent = 'Erreur : ' + (err.message || 'impossible d\'ajouter ce jour férié');
            erreur.style.display = 'block';
        } finally {
            btn.disabled = false;
        }
    });
})();

// ========== TABLE RTT ==========

async function chargerTableauRTT() {
    genererOptionsJours();
    await chargerConfigTraitements();
    initRTTParams();
    await chargerRTTAnnuels();
}

// ========== PARAMETRES RTT PAR ANNEE ==========

let rttParamsInit = false;
let rttCalcData = null; // Stocke les données du dernier calcul

function initRTTParams() {
    if (rttParamsInit) return;
    rttParamsInit = true;

    document.getElementById('rttAnnee').value = new Date().getFullYear();

    // Vérifier les fériés et rafraîchir le tableau quand l'année change
    async function verifierFeriesRTT() {
        const annee = parseInt(document.getElementById('rttAnnee').value);
        const warningEl = document.getElementById('rttWarningFeries');
        const btnCalc = document.getElementById('btnCalculerRTT');

        if (!annee || annee < 2022) {
            warningEl.style.display = 'none';
            document.getElementById('btnEnregistrerRTT').disabled = false;
            return;
        }

        // Lire la date de traitement depuis les selects de la tuile
        const moisTraitement = parseInt(document.getElementById('rttMois').value) || 6;

        // La période couvre annee et annee+1 (sauf si traitement en janvier)
        const anneesConcernees = moisTraitement === 1 ? [annee] : [annee, annee + 1];

        let anneesMissing = [];
        for (const a of anneesConcernees) {
            const feries = await window.api.getJoursFeries(a) || [];
            if (feries.length === 0) anneesMissing.push(a);
        }

        if (anneesMissing.length > 0) {
            warningEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Aucun jour férié renseigné pour ${anneesMissing.join(' et ')}. Ajoutez-les dans la page "Jours fériés" avant d'enregistrer.`;
            warningEl.style.display = 'block';
            document.getElementById('btnEnregistrerRTT').disabled = true;
        } else {
            warningEl.style.display = 'none';
            document.getElementById('btnEnregistrerRTT').disabled = false;
        }

        await chargerRTTAnnuels();
    }

    document.getElementById('rttAnnee').addEventListener('change', verifierFeriesRTT);
    document.getElementById('rttAnnee').addEventListener('input', verifierFeriesRTT);
    verifierFeriesRTT(); // vérifier au chargement

    // Bouton Calculer
    document.getElementById('btnCalculerRTT').addEventListener('click', async () => {
        const annee = parseInt(document.getElementById('rttAnnee').value);
        const cp = parseInt(document.getElementById('rttCPDeduire').value) || 25;
        const forfait = parseInt(document.getElementById('rttForfaitJours').value) || 218;

        if (!annee || annee < 2022) {
            alert('Veuillez saisir une année valide (à partir de 2022)');
            return;
        }

        // Lire la date de traitement RTT depuis les selects de la tuile
        const jourTraitement = parseInt(document.getElementById('rttJour').value) || 1;
        const moisTraitement = parseInt(document.getElementById('rttMois').value) || 6;

        // Période de référence : date traitement N → veille date traitement N+1
        const debut = new Date(annee, moisTraitement - 1, jourTraitement);
        const finDate = new Date(annee + 1, moisTraitement - 1, jourTraitement);
        finDate.setDate(finDate.getDate() - 1);

        // Compter jours totaux et weekends
        let totalJours = 0;
        let weekends = 0;
        const d = new Date(debut);
        while (d <= finDate) {
            totalJours++;
            const dow = d.getDay();
            if (dow === 0 || dow === 6) weekends++;
            d.setDate(d.getDate() + 1);
        }

        // Récupérer les jours fériés de la DB
        let feries = [];
        try {
            const feriesN = await window.api.getJoursFeries(annee) || [];
            const feriesN1 = await window.api.getJoursFeries(annee + 1) || [];
            feries = [...feriesN, ...feriesN1];
        } catch (e) {
            console.error('Erreur chargement jours fériés:', e);
        }

        // Fériés dans la période et hors weekends
        let feriesHorsWE = 0;
        feries.forEach(f => {
            const dateF = new Date(f.date + 'T00:00:00');
            if (dateF >= debut && dateF <= finDate) {
                const dow = dateF.getDay();
                if (dow !== 0 && dow !== 6) feriesHorsWE++;
            }
        });

        // RTT = jours période - WE - fériés hors WE - CP - forfait jours
        const joursOuvres = totalJours - weekends - feriesHorsWE;
        const rtt = joursOuvres - cp - forfait;

        // Formater les dates pour l'affichage
        const moisNoms = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
        const debutLabel = `${jourTraitement} ${moisNoms[moisTraitement - 1]} ${annee}`;
        const finLabel = `${finDate.getDate()} ${moisNoms[finDate.getMonth()]} ${finDate.getFullYear()}`;

        // Formater les dates pour la DB
        const pad = n => String(n).padStart(2, '0');
        const dateDebutStr = `${annee}-${pad(moisTraitement)}-${pad(jourTraitement)}`;
        const dateFinStr = `${finDate.getFullYear()}-${pad(finDate.getMonth() + 1)}-${pad(finDate.getDate())}`;

        // Stocker pour l'enregistrement
        rttCalcData = {
            annee_debut: annee,
            date_debut: dateDebutStr,
            date_fin: dateFinStr,
            nb_jours_periode: totalJours,
            nb_jours_we: weekends,
            nb_jours_feries_hors_we: feriesHorsWE,
            nb_jours_travailles: forfait,
            nb_cp_a_deduire: cp,
            nb_rtt: rtt
        };

        // Afficher le détail
        document.getElementById('rttPeriodeLabel').textContent = `${debutLabel} → ${finLabel}`;
        document.getElementById('rttJoursPeriode').textContent = totalJours;
        document.getElementById('rttWeekends').textContent = weekends;
        document.getElementById('rttFeries').textContent = feriesHorsWE;
        document.getElementById('rttJoursOuvres').textContent = joursOuvres;
        document.getElementById('rttCPAffiche').textContent = cp;
        document.getElementById('rttForfaitAffiche').textContent = forfait;
        document.getElementById('rttCalcules').textContent = rtt + 'j';
        document.getElementById('rttDetailCalc').style.display = 'block';
        // Re-vérifier l'état du bouton Enregistrer
        await verifierFeriesRTT();
    });

    // Bouton Enregistrer
    document.getElementById('btnEnregistrerRTT').addEventListener('click', async () => {
        if (!rttCalcData) {
            alert('Veuillez d\'abord calculer les RTT');
            return;
        }

        try {
            await window.api.addRTTAnnuel(rttCalcData);
            await chargerRTTAnnuels();
            // Feedback
            const btn = document.getElementById('btnEnregistrerRTT');
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistré !';
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-save"></i> Enregistrer';
            }, 1500);
        } catch (error) {
            console.error('Erreur ajout RTT:', error);
            alert('Erreur lors de l\'enregistrement : ' + error.message);
        }
    });
}

async function chargerRTTAnnuels() {
    try {
        const rttList = await window.api.getRTTAnnuels();
        const tbody = document.getElementById('rttAnnuelsBody');
        const anneeFiltre = parseInt(document.getElementById('rttAnnee').value);

        const r = rttList ? rttList.find(x => x.annee_debut === anneeFiltre) : null;

        if (!r) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">${anneeFiltre ? 'Aucun paramètre RTT pour ' + anneeFiltre : 'Saisissez une année'}</td></tr>`;
            return;
        }

        const isOldFormat = r.nb_rtt == null;
        const rtt = r.nb_rtt != null ? r.nb_rtt : '-';
        let periodeLabel = '-';
        if (r.date_debut && r.date_fin) {
            const deb = new Date(r.date_debut + 'T00:00:00');
            const fin = new Date(r.date_fin + 'T00:00:00');
            const opts = { day: 'numeric', month: 'short', year: 'numeric' };
            periodeLabel = `${deb.toLocaleDateString('fr-FR', opts)} → ${fin.toLocaleDateString('fr-FR', opts)}`;
        }
        const joursOuvres = (r.nb_jours_periode != null && r.nb_jours_we != null)
            ? r.nb_jours_periode - r.nb_jours_we - (r.nb_jours_feries_hors_we || 0)
            : '-';
        const oldWarning = isOldFormat ? ' <small style="color: var(--orange);" title="Recalculer pour mettre à jour">⚠</small>' : '';
        tbody.innerHTML = `
            <tr${isOldFormat ? ' style="opacity: 0.6;"' : ''}>
                <td><strong>${r.annee_debut}</strong>${oldWarning}</td>
                <td>${periodeLabel}</td>
                <td>${joursOuvres}</td>
                <td>${r.nb_jours_feries_hors_we != null ? r.nb_jours_feries_hors_we : '-'}</td>
                <td>${r.nb_cp_a_deduire || 25}</td>
                <td>${r.nb_jours_travailles || '-'}</td>
                <td><strong class="rtt-recap-value">${isOldFormat ? '-' : rtt + 'j'}</strong></td>
            </tr>
        `;
    } catch (error) {
        console.error('Erreur chargement RTT annuels:', error);
    }
}

// ========== GESTION MODALE SALARIÉ ==========

const modal = document.getElementById('modalSalarie');
const modalTitle = document.getElementById('modalTitle');
const formSalarie = document.getElementById('formSalarie');
let editingSalarieId = null;

// Ouvrir la modale pour ajouter
document.getElementById('btnAjouterSalarie').addEventListener('click', () => {
    editingSalarieId = null;
    modalTitle.textContent = 'Ajouter un salarié';
    formSalarie.reset();
    document.getElementById('salarieId').value = '';
    document.getElementById('en_arret_maladie').checked = false;
    document.getElementById('date_arret_maladie').value = '';
    document.getElementById('dateArretGroup').style.display = 'none';
    modal.style.display = 'flex';
});

// Fermer la modale
document.getElementById('closeModal').addEventListener('click', () => {
    modal.style.display = 'none';
});

document.getElementById('cancelModal').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Fermeture au clic extérieur désactivée

// Toggle affichage date arrêt maladie
document.getElementById('en_arret_maladie').addEventListener('change', function() {
    const dateGroup = document.getElementById('dateArretGroup');
    const label = document.getElementById('labelDateArret');
    const dateInput = document.getElementById('date_arret_maladie');

    if (editingSalarieId) {
        // En mode édition : toujours demander la date (arrêt OU reprise)
        dateGroup.style.display = '';
        dateInput.value = '';
        label.textContent = this.checked ? "Date de début d'arrêt *" : 'Date de reprise *';
    } else {
        // En mode création : seulement si coché
        dateGroup.style.display = this.checked ? '' : 'none';
        label.textContent = "Date de début d'arrêt *";
        if (!this.checked) dateInput.value = '';
    }
});

// Soumission du formulaire
formSalarie.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const errorMsg = document.getElementById('errorModalMessage');
    const successMsg = document.getElementById('successModalMessage');
    
    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');
    
    const enArret = document.getElementById('en_arret_maladie').checked ? 1 : 0;
    const dateArret = document.getElementById('date_arret_maladie').value;

    // Validation : la date est obligatoire si on change le statut arrêt
    if (editingSalarieId) {
        // En édition : date obligatoire si le statut a changé
        const dateGroup = document.getElementById('dateArretGroup');
        if (dateGroup.style.display !== 'none' && !dateArret) {
            const errorMsg2 = document.getElementById('errorModalMessage');
            errorMsg2.textContent = enArret ? 'La date de début d\'arrêt est obligatoire' : 'La date de reprise est obligatoire';
            errorMsg2.classList.add('show');
            return;
        }
    } else {
        // En création : date obligatoire seulement si en arrêt
        if (enArret && !dateArret) {
            const errorMsg2 = document.getElementById('errorModalMessage');
            errorMsg2.textContent = 'La date de début d\'arrêt est obligatoire';
            errorMsg2.classList.add('show');
            return;
        }
    }

    const salarieData = {
        nom: document.getElementById('nom').value.trim(),
        prenom: document.getElementById('prenom').value.trim(),
        email: document.getElementById('email').value.trim(),
        date_embauche: document.getElementById('date_embauche').value,
        type_contrat: document.getElementById('type_contrat').value,
        a_droit_rtt: document.getElementById('a_droit_rtt').checked ? 1 : 0,
        a_droit_recup: document.getElementById('a_droit_recup').checked ? 1 : 0,
        en_arret_maladie: enArret,
        date_arret_maladie: dateArret || null
    };
    
    try {
        let result;
        if (editingSalarieId) {
            // Modification
            result = await window.api.updateSalarie(editingSalarieId, salarieData);
        } else {
            // Création
            result = await window.api.createSalarie(salarieData);
        }

        if (result && result.success === false) {
            errorMsg.textContent = result.message || 'Erreur lors de l\'enregistrement';
            errorMsg.classList.add('show');
            return;
        }

        successMsg.textContent = editingSalarieId ? 'Salarié modifié avec succès !' : 'Salarié créé avec succès !';
        successMsg.classList.add('show');
        setTimeout(() => { successMsg.classList.remove('show'); }, 3000);

        // Recharger la liste
        await chargerSalaries();

        // Si c'est l'admin connecté qui a été modifié, rafraîchir ses soldes et le formulaire
        if (editingSalarieId === user.id) {
            await loadSoldesAdmin();
            await initFormAbsenceAdmin();
        }

        // Fermer après 1 seconde
        setTimeout(() => {
            modal.style.display = 'none';
        }, 1000);

    } catch (error) {
        console.error('Erreur:', error);
        errorMsg.textContent = 'Erreur lors de l\'enregistrement';
        errorMsg.classList.add('show');
    }
});

// Fonction pour ouvrir la modale en mode édition
window.editSalarie = async (salarieId) => {
    try {
        const salarie = await window.api.getSalarie(salarieId);
        
        editingSalarieId = salarieId;
        modalTitle.textContent = 'Modifier le salarié';
        
        document.getElementById('salarieId').value = salarieId;
        document.getElementById('nom').value = salarie.nom;
        document.getElementById('prenom').value = salarie.prenom;
        document.getElementById('email').value = salarie.email;
        document.getElementById('date_embauche').value = salarie.date_embauche;
        document.getElementById('type_contrat').value = salarie.type_contrat;
        document.getElementById('a_droit_rtt').checked = salarie.a_droit_rtt === 1;
        document.getElementById('a_droit_recup').checked = salarie.a_droit_recup === 1;
        document.getElementById('en_arret_maladie').checked = salarie.en_arret_maladie === 1;
        document.getElementById('date_arret_maladie').value = '';
        document.getElementById('dateArretGroup').style.display = 'none';
        document.getElementById('labelDateArret').textContent = "Date de début d'arrêt *";
        
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Erreur chargement salarié:', error);
    }
};

// Fonction pour désactiver un salarié
window.deactivateSalarie = async (salarieId, nom, prenom) => {
    if (confirm(`Êtes-vous sûr de vouloir désactiver ${prenom} ${nom} ?\n\nLe salarié ne pourra plus se connecter mais son historique sera conservé.`)) {
        try {
            await window.api.deactivateSalarie(salarieId);
            await chargerSalaries();
            alert('Salarié désactivé avec succès');
        } catch (error) {
            console.error('Erreur désactivation:', error);
            alert('Erreur lors de la désactivation');
        }
    }
};

// Fonction pour réinitialiser le mot de passe
window.resetPassword = async (salarieId, nom, prenom) => {
    if (confirm(`Réinitialiser le mot de passe de ${prenom} ${nom} ?\n\nLe salarié devra créer un nouveau mot de passe à sa prochaine connexion.`)) {
        try {
            await window.api.resetPassword(salarieId);
            alert('Mot de passe réinitialisé avec succès');
        } catch (error) {
            console.error('Erreur réinitialisation:', error);
            alert('Erreur lors de la réinitialisation');
        }
    }
};

// ========== AUTRES BOUTONS ==========

// Bouton "Ajouter" géré par la modale initialisée dans la section JOURS FÉRIÉS

// Bouton déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
});

// ========== SECTION MES CONGÉS (reprise du dashboard user) ==========
let joursFeriesUser = [];
let absencesUser = [];
let hasChevauchementAdmin = false;

async function initMesConges() {
    await loadSoldesAdmin();
    await initFormAbsenceAdmin();
    await chargerCalendrierUser();
    await afficherHistoriqueAdmin();
    // Navigation année gérée par changerAnneeAdmin() dans la topbar
}

// Charger les soldes de l'admin
async function loadSoldesAdmin() {
    try {
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        const salarie = await window.api.getSalarie(user.id);
        const pending = await window.api.getEnAttenteParSalarie(user.id, anneeActuelle);

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

            document.getElementById('solde-cp-n1-user').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n-user').textContent = soldes.cp_n.toFixed(2) + 'j';
            appliquerEtatSolde(document.querySelector('#mes-conges-section .solde-card-compact.cp-n1'), soldes.cp_n1);
            appliquerEtatSolde(document.querySelector('#mes-conges-section .solde-card-compact.cp-n'), soldes.cp_n);

            // Pending CP : répartition N-1 puis N
            const cpPending = (pending && pending.cp) || 0;
            const cpN1Pending = Math.min(Math.max(soldes.cp_n1, 0), cpPending);
            const cpNPending = Math.max(0, cpPending - cpN1Pending);
            afficherPending(document.getElementById('solde-cp-n1-user-pending'), cpN1Pending);
            afficherPending(document.getElementById('solde-cp-n-user-pending'), cpNPending);

            // RTT
            const tuileRTT = document.querySelector('#mes-conges-section .solde-card-compact.rtt');
            const pendingRTTEl = document.getElementById('solde-rtt-user-pending');
            if (salarie.a_droit_rtt === 1) {
                document.getElementById('solde-rtt-user').textContent = soldes.rtt.toFixed(2) + 'j';
                appliquerEtatSolde(tuileRTT, soldes.rtt);
                afficherPending(pendingRTTEl, (pending && pending.rtt) || 0);
            } else {
                document.getElementById('solde-rtt-user').textContent = 'N/A';
                if (tuileRTT) {
                    tuileRTT.classList.remove('solde-positif', 'solde-zero', 'solde-negatif');
                    tuileRTT.classList.add('sans-droit');
                }
                afficherPending(pendingRTTEl, 0);
            }

            // Récup
            const tuileRecup = document.querySelector('#mes-conges-section .solde-card-compact.recup');
            const pendingRecupEl = document.getElementById('solde-recup-user-pending');
            if (salarie.a_droit_recup === 1) {
                const recupJours = (soldes.recup_heures / 7).toFixed(2);
                document.getElementById('solde-recup-user').innerHTML =
                    `${soldes.recup_heures.toFixed(1)}h<p>(${recupJours}j)</p>`;
                appliquerEtatSolde(tuileRecup, soldes.recup_heures);
                afficherPending(pendingRecupEl, (pending && pending.recup_heures) || 0, 'h');
            } else {
                document.getElementById('solde-recup-user').textContent = 'N/A';
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

// ========== WORKFLOW VALIDATION — DEMANDES EN ATTENTE (admin) ==========

let demandeEnCoursRefus = null;

async function loadDemandesEnAttente() {
    try {
        const demandes = await window.api.getAbsencesEnAttente();
        const bandeau = document.getElementById('bandeauDemandesAttente');
        const liste = document.getElementById('listeDemandesAttente');
        const nbEl = document.getElementById('nbDemandesAttente');
        const badge = document.getElementById('navBadgeDemandes');

        const count = demandes.length;
        if (nbEl) nbEl.textContent = count;
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!bandeau || !liste) return;

        if (count === 0) {
            bandeau.style.display = 'none';
            return;
        }
        bandeau.style.display = 'block';

        const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
        const labelsType = { CP: 'CP', CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };

        liste.innerHTML = demandes.map(d => {
            const dureeStr = (d.type === 'RECUP' && !d.duree_jours) ? `${d.duree_heures}h` : `${(d.duree_jours || 0).toFixed(1)}j`;
            const periode = d.date_debut === d.date_fin ? fmtDate(d.date_debut) : `${fmtDate(d.date_debut)} → ${fmtDate(d.date_fin)}`;
            const commentaire = d.commentaire
                ? `<div class="demande-card-commentaire" title="${escapeHtml(d.commentaire)}">« ${escapeHtml(d.commentaire)} »</div>`
                : '';
            return `
                <div class="demande-card type-${d.type}" data-absence-id="${d.id}" data-salarie-id="${d.salarie_id}" data-annee="${new Date(d.date_debut).getFullYear()}" title="Voir dans le calendrier du salarié">
                    <div class="demande-card-info">
                        <div class="demande-card-salarie">${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</div>
                        <div class="demande-card-details">${labelsType[d.type] || d.type} · ${periode} · ${dureeStr}</div>
                        ${commentaire}
                    </div>
                    <div class="demande-card-actions">
                        <button class="btn-valider-demande" data-id="${d.id}" title="Valider">
                            <i class="fa-solid fa-check"></i> Valider
                        </button>
                        <button class="btn-refuser-demande" data-id="${d.id}" title="Refuser">
                            <i class="fa-solid fa-xmark"></i> Refuser
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Clic sur la card → ouvre le calendrier du salarié à l'année de la demande
        liste.querySelectorAll('.demande-card').forEach(card => {
            card.addEventListener('click', () => {
                const salarieId = parseInt(card.dataset.salarieId, 10);
                const annee = parseInt(card.dataset.annee, 10);
                ouvrirCalendrierSalarieHistorique(salarieId, annee);
            });
        });

        // Boutons Valider / Refuser : stopPropagation pour ne pas déclencher le clic sur la card
        liste.querySelectorAll('.btn-valider-demande').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                validerDemande(parseInt(btn.dataset.id, 10));
            });
        });
        liste.querySelectorAll('.btn-refuser-demande').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                ouvrirModaleRefus(parseInt(btn.dataset.id, 10), demandes);
            });
        });
    } catch (err) {
        console.error('Erreur chargement demandes en attente:', err);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ouvrirCalendrierSalarieHistorique(salarieId, annee) {
    if (!salarieId) return;
    salarieHistoriqueSelectionne = salarieId;
    if (typeof annee === 'number' && !isNaN(annee)) {
        anneeHistorique = annee;
        updateYearNavDisplay();
    }
    const select = document.getElementById('selectSalarieHistorique');
    if (select) select.value = String(salarieId);
    chargerCalendrierHistorique();
    // Scroll vers le calendrier pour que l'admin voie le résultat
    const calendrierDiv = document.getElementById('calendrierHistorique');
    if (calendrierDiv) {
        setTimeout(() => calendrierDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
}

async function validerDemande(absenceId) {
    const btn = document.querySelector(`.btn-valider-demande[data-id="${absenceId}"]`);
    const btnRefuser = document.querySelector(`.btn-refuser-demande[data-id="${absenceId}"]`);
    if (btn) btn.disabled = true;
    if (btnRefuser) btnRefuser.disabled = true;

    try {
        await window.api.validerAbsence(absenceId, user.id);
        await loadDemandesEnAttente();
        // Rafraîchir le calendrier historique si un salarié est sélectionné
        if (salarieHistoriqueSelectionne) await chargerCalendrierHistorique();
    } catch (err) {
        console.error('Erreur validation demande:', err);
        alert('Erreur : ' + (err.message || err));
        if (btn) btn.disabled = false;
        if (btnRefuser) btnRefuser.disabled = false;
    }
}

function ouvrirModaleRefus(absenceId, demandes) {
    const demande = demandes.find(d => d.id === absenceId);
    if (!demande) return;
    demandeEnCoursRefus = demande;

    const modal = document.getElementById('modalRefusDemande');
    const infoBloc = document.getElementById('infoRefusDemande');
    const motifEl = document.getElementById('motifRefusDemande');
    const msgEl = document.getElementById('refusDemandeMsg');

    const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
    const labelsType = { CP: 'CP', CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'Récup' };
    const dureeStr = (demande.type === 'RECUP' && !demande.duree_jours) ? `${demande.duree_heures}h` : `${(demande.duree_jours || 0).toFixed(1)}j`;

    infoBloc.innerHTML = `
        <strong>${escapeHtml(demande.prenom)} ${escapeHtml(demande.nom)}</strong><br>
        ${labelsType[demande.type] || demande.type} · du ${fmtDate(demande.date_debut)} au ${fmtDate(demande.date_fin)} (${dureeStr})
        ${demande.commentaire ? `<br><em>« ${escapeHtml(demande.commentaire)} »</em>` : ''}
    `;
    motifEl.value = '';
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
    modal.style.display = 'flex';
    setTimeout(() => motifEl.focus(), 50);
}

function fermerModaleRefus() {
    document.getElementById('modalRefusDemande').style.display = 'none';
    demandeEnCoursRefus = null;
}

async function confirmerRefusDemande() {
    if (!demandeEnCoursRefus) return;
    const motif = document.getElementById('motifRefusDemande').value.trim();
    const msgEl = document.getElementById('refusDemandeMsg');
    if (!motif) {
        if (msgEl) {
            msgEl.textContent = 'Le motif de refus est obligatoire.';
            msgEl.className = 'error-message';
            msgEl.style.display = 'block';
        }
        return;
    }

    const btnConfirmer = document.getElementById('btnConfirmerRefusDemande');
    btnConfirmer.disabled = true;
    try {
        await window.api.refuserAbsence(demandeEnCoursRefus.id, user.id, motif);
        fermerModaleRefus();
        await loadDemandesEnAttente();
        if (salarieHistoriqueSelectionne) await chargerCalendrierHistorique();
    } catch (err) {
        console.error('Erreur refus demande:', err);
        if (msgEl) {
            msgEl.textContent = 'Erreur : ' + (err.message || err);
            msgEl.className = 'error-message';
            msgEl.style.display = 'block';
        }
    } finally {
        btnConfirmer.disabled = false;
    }
}

// Listeners modale refus (attachés une seule fois)
(function initModaleRefusDemande() {
    const closeBtn = document.getElementById('closeModalRefusDemande');
    const cancelBtn = document.getElementById('btnAnnulerRefusDemande');
    const confirmBtn = document.getElementById('btnConfirmerRefusDemande');
    if (closeBtn) closeBtn.addEventListener('click', fermerModaleRefus);
    if (cancelBtn) cancelBtn.addEventListener('click', fermerModaleRefus);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmerRefusDemande);
})();

// Toggle collapse de la bandeau
(function initBandeauDemandes() {
    const btn = document.getElementById('btnToggleDemandesAttente');
    const liste = document.getElementById('listeDemandesAttente');
    if (!btn || !liste) return;
    btn.addEventListener('click', () => {
        const collapsed = liste.classList.toggle('hidden');
        btn.classList.toggle('collapsed', collapsed);
    });
})();

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
        absencesUser = await window.api.getAbsences(user.id);  // ← AJOUTE cette ligne !
        absencesUser = absencesUser.filter(abs => {
            const anneeDebut = new Date(abs.date_debut).getFullYear();
            const anneeFin = new Date(abs.date_fin).getFullYear();
            return anneeDebut === anneeActuelle || anneeFin === anneeActuelle;
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
    
    const nomsJoursCourts = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
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
        // Adapter pour commencer le lundi (0 = lundi, 6 = dimanche)
        let premierJourSemaine = premierJour.getDay() - 1;
        if (premierJourSemaine === -1) premierJourSemaine = 6; // Si dimanche, mettre à la fin        
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
            jourDiv.dataset.date = dateISO;

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

                if (absence.statut === 'en_attente') {
                    jourDiv.classList.add('en-attente');
                    tooltipLabel += ' — En attente de validation';
                }

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
    const container = document.getElementById('calendrierAnnuelUser');
    if (!container) return;

    container.addEventListener('mousedown', (e) => {
        const jourDiv = e.target.closest('.jour[data-date]');
        if (!jourDiv || jourDiv.classList.contains('vide')) return;
        e.preventDefault();
        dragStartDate = jourDiv.dataset.date;
        isDragging = true;
        document.getElementById('dateDebutUser').value = dragStartDate;
        document.getElementById('dateFinUser').value = dragStartDate;
        surlignerJoursPrevisualisation(dragStartDate, dragStartDate);
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const jourDiv = e.target.closest('.jour[data-date]');
        if (!jourDiv || jourDiv.classList.contains('vide')) return;
        const currentDate = jourDiv.dataset.date;
        const debut = dragStartDate < currentDate ? dragStartDate : currentDate;
        const fin = dragStartDate < currentDate ? currentDate : dragStartDate;
        document.getElementById('dateDebutUser').value = debut;
        document.getElementById('dateFinUser').value = fin;
        surlignerJoursPrevisualisation(debut, fin);
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        dragStartDate = null;
        calculerDureeAbsenceAdmin();
    });
}

async function chargerCalendrierUser() {
    await chargerJoursFeriesUser();
    await chargerAbsencesUser();
    genererCalendrierUser();
    initCalendrierDragSelect();
}

async function initFormAbsenceAdmin() {
    try {
        const salarie = await window.api.getSalarie(user.id);
        const typeAbsenceSelect = document.getElementById('typeAbsenceUser');
        
        if (!typeAbsenceSelect) return;
        
        // Supprimer les options dynamiques existantes
        const existingRTT = Array.from(typeAbsenceSelect.options).find(opt => opt.value === 'RTT');
        if (existingRTT) existingRTT.remove();
        const existingRecup = Array.from(typeAbsenceSelect.options).find(opt => opt.value === 'RECUP');
        if (existingRecup) existingRecup.remove();

        // Réajouter dans l'ordre alpha : CP (déjà en dur), Récupération, RTT
        if (salarie.a_droit_recup === 1) {
            const optionRecup = document.createElement('option');
            optionRecup.value = 'RECUP';
            optionRecup.textContent = 'Récupération';
            typeAbsenceSelect.appendChild(optionRecup);
        }

        if (salarie.a_droit_rtt === 1) {
            const optionRTT = document.createElement('option');
            optionRTT.value = 'RTT';
            optionRTT.textContent = 'RTT';
            typeAbsenceSelect.appendChild(optionRTT);
        }
    } catch (error) {
        console.error('Erreur init formulaire:', error);
    }

    updateBtnValiderAdmin();
}

// Listeners formulaire admin — attachés une seule fois au chargement
(function initFormListenersAdmin() {
    const typeSelect = document.getElementById('typeAbsenceUser');
    const recupFields = document.getElementById('recupFieldsUser');
    const recupTypeSelect = document.getElementById('recupTypeUser');
    const recupHeuresGroup = document.getElementById('recupHeuresGroupUser');
    const dateDebut = document.getElementById('dateDebutUser');
    const dateFin = document.getElementById('dateFinUser');
    const recupHeures = document.getElementById('recupHeuresUser');
    
    // Afficher/masquer champs Récup
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            if (recupFields) {
                recupFields.style.display = e.target.value === 'RECUP' ? 'block' : 'none';
            }
            calculerDureeAbsenceAdmin();
            updateBtnValiderAdmin();
        });
    }

    // Afficher/masquer champ heures
    if (recupTypeSelect) {
        recupTypeSelect.addEventListener('change', (e) => {
            if (recupHeuresGroup) {
                recupHeuresGroup.style.display = e.target.value === 'heures' ? 'block' : 'none';
                if (recupHeures) {
                    recupHeures.required = e.target.value === 'heures';
                }
            }
            calculerDureeAbsenceAdmin();
            updateBtnValiderAdmin();
        });
    }

    // Calcul automatique sur changement de dates
    if (dateDebut) {
        dateDebut.addEventListener('change', () => {
            calculerDureeAbsenceAdmin();
            updateBtnValiderAdmin();
            if (dateFin.value) {
                surlignerJoursPrevisualisation(dateDebut.value, dateFin.value);
            }
        });
    }

    if (dateFin) {
        dateFin.addEventListener('change', () => {
            calculerDureeAbsenceAdmin();
            updateBtnValiderAdmin();
            if (dateDebut.value) {
                surlignerJoursPrevisualisation(dateDebut.value, dateFin.value);
            }
        });
    }

    // Toggle AM/PM buttons
    document.querySelectorAll('#mes-conges-section .period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const toggle = btn.closest('.period-toggle');
            toggle.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target).value = btn.dataset.value;
            calculerDureeAbsenceAdmin();
            updateBtnValiderAdmin();
        });
    });

    if (recupHeures) {
        recupHeures.addEventListener('input', () => { calculerDureeAbsenceAdmin(); updateBtnValiderAdmin(); });
    }
})();

// ========== VALIDATION BOUTON VALIDER (ADMIN) ==========

function updateBtnValiderAdmin() {
    const btn = document.getElementById('btnValiderUser');
    const wrapper = document.getElementById('btnSubmitWrapperUser');
    if (!btn || !wrapper) return;
    const type = document.getElementById('typeAbsenceUser').value;
    const dateDebut = document.getElementById('dateDebutUser').value;
    const dateFin = document.getElementById('dateFinUser').value;
    const recupType = document.getElementById('recupTypeUser')?.value;
    const recupHeures = document.getElementById('recupHeuresUser')?.value;

    const manquants = [];
    if (!type) manquants.push('type d\'absence');
    if (!dateDebut || !dateFin) manquants.push('dates');
    if (dateDebut && dateFin && dateFin < dateDebut) manquants.push('date de fin antérieure au début');
    const resumeDiv = document.getElementById('resumeAbsenceUser');
    if (dateDebut && dateFin && dateFin >= dateDebut && type && resumeDiv && resumeDiv.style.display === 'none') {
        manquants.push('aucun jour ouvré dans cette période');
    }
    if (type === 'RECUP' && recupType === 'heures' && (!recupHeures || recupHeures <= 0)) {
        manquants.push('nombre d\'heures');
    }
    if (hasChevauchementAdmin) {
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

// ========== CALCUL ET VALIDATION DES ABSENCES (ADMIN) ==========

// Fonction pour calculer la durée automatiquement
async function calculerDureeAbsenceAdmin() {
    const typeAbsence = document.getElementById('typeAbsenceUser').value;
    const dateDebut = document.getElementById('dateDebutUser').value;
    const dateFin = document.getElementById('dateFinUser').value;
    const debutPeriode = document.getElementById('debutApremUser').value === 'pm' ? 'apres-midi' : 'matin';
    const finPeriode = document.getElementById('finMidiUser').value === 'am' ? 'midi' : 'fin-journee';
    const recupType = document.getElementById('recupTypeUser')?.value;
    const recupHeures = document.getElementById('recupHeuresUser')?.value;

    const resumeDiv = document.getElementById('resumeAbsenceUser');
    const resumeDuree = document.getElementById('resumeDureeUser');
    const resumeDecompte = document.getElementById('resumeDecompteUser');
    const alerteSolde = document.getElementById('alerteSoldeUser');
    const alertePeriode = document.getElementById('alertePeriodeUser');

    // Réinitialiser les alertes
    alerteSolde.textContent = '';
    alerteSolde.classList.remove('alert-warning');
    alertePeriode.textContent = '';
    alertePeriode.classList.remove('alert-warning');

    if (!dateDebut || !dateFin) {
        resumeDiv.style.display = 'none';
        updateBtnValiderAdmin();
        return;
    }

    if (dateFin < dateDebut) {
        resumeDiv.style.display = 'none';
        updateBtnValiderAdmin();
        return;
    }

    // Vérifier si la période est dans le passé
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const debut = new Date(dateDebut);

    if (debut < aujourdhui) {
        alertePeriode.textContent = '⚠️ La période commence dans le passé';
        alertePeriode.classList.add('alert-warning');
    }

    if (!typeAbsence) {
        resumeDiv.style.display = 'block';
        try {
            const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
            resumeDuree.textContent = `${result.dureeJours.toFixed(2)} jour(s)`;
            resumeDecompte.textContent = 'Sélectionnez un type d\'absence';
        } catch (error) {
            console.error('Erreur calcul durée:', error);
        }
        return;
    }
    
    try {
        let dureeJours = 0;
        let dureeHeures = 0;
        
        // Calcul selon le type
        if (typeAbsence === 'RECUP' && recupType === 'heures') {
            if (!recupHeures || recupHeures <= 0) {
                resumeDiv.style.display = 'none';
                return;
            }
            dureeHeures = parseFloat(recupHeures);
            dureeJours = dureeHeures / 7;
        } else {
            const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
            dureeJours = result.dureeJours;
            dureeHeures = dureeJours * 7;
        }

        // Bloquer si durée = 0 (jour férié, weekend...)
        if (dureeJours <= 0) {
            alertePeriode.textContent = '⚠️ Aucun jour ouvré dans cette période (jour férié ou weekend)';
            alertePeriode.classList.add('alert-warning');
            resumeDiv.style.display = 'none';
            updateBtnValiderAdmin();
            return;
        }

        // Récupérer les soldes actuels
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);

        // Afficher la durée
        resumeDuree.textContent = typeAbsence === 'RECUP' && recupType === 'heures'
            ? `${dureeHeures.toFixed(1)} heure(s)`
            : `${dureeJours.toFixed(2)} jour(s)`;

        // Calculer et afficher le décompte selon le type
        let soldeNegatif = false;

        if (typeAbsence === 'CP') {
            const cpN1Utilise = Math.min(dureeJours, soldes.cp_n1);
            const cpNUtilise = Math.max(0, dureeJours - soldes.cp_n1);
            const nouveauCPN1 = soldes.cp_n1 - cpN1Utilise;
            const nouveauCPN = soldes.cp_n - cpNUtilise;
            if (nouveauCPN < 0) soldeNegatif = true;

            resumeDecompte.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>CP N-1</strong></td><td>${cpN1Utilise.toFixed(1)}j</td><td>${nouveauCPN1.toFixed(1)}j</td></tr>
                <tr><td><strong>CP N</strong></td><td>${cpNUtilise.toFixed(1)}j</td><td style="color:${nouveauCPN < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauCPN.toFixed(1)}j</td></tr>
            </table>`;

        } else if (typeAbsence === 'RTT') {
            const nouveauRTT = soldes.rtt - dureeJours;
            if (nouveauRTT < 0) soldeNegatif = true;
            resumeDecompte.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>RTT</strong></td><td>${dureeJours.toFixed(1)}j</td><td style="color:${nouveauRTT < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauRTT.toFixed(1)}j</td></tr>
            </table>`;

        } else if (typeAbsence === 'RECUP') {
            const nouvelleRecup = soldes.recup_heures - dureeHeures;
            if (nouvelleRecup < 0) soldeNegatif = true;
            resumeDecompte.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>Récup</strong></td><td>${dureeHeures.toFixed(1)}h</td><td style="color:${nouvelleRecup < 0 ? 'var(--rouge)' : 'inherit'}">${nouvelleRecup.toFixed(1)}h</td></tr>
            </table>`;

        } else if (typeAbsence === 'MALADIE') {
            resumeDecompte.textContent = 'Pas de décompte';
        }
        
        // Alerte solde
        if (soldeNegatif) {
            alerteSolde.textContent = '⚠️ Cette absence mettra votre solde en négatif';
            alerteSolde.classList.add('alert-warning');
        } else if (typeAbsence !== 'MALADIE') {
            alerteSolde.textContent = '✓ Solde suffisant';
        }
        
        // Vérifier les chevauchements (absences valides + en attente, hors maladie)
        const absences = await window.api.getAbsences(user.id);
        const chevauchement = absences.find(abs => {
            if (abs.statut !== 'valide' && abs.statut !== 'en_attente') return false;
            return (dateDebut <= abs.date_fin && dateFin >= abs.date_debut);
        });

        hasChevauchementAdmin = !!chevauchement;

        if (chevauchement) {
            const typesTexte = { CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };
            const typeTexte = typesTexte[chevauchement.type] || chevauchement.type;
            const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
            const suffixe = chevauchement.statut === 'en_attente' ? ' (en attente)' : '';
            alertePeriode.textContent = `⚠️ Chevauchement avec ${typeTexte}${suffixe} du ${fmtDate(chevauchement.date_debut)} au ${fmtDate(chevauchement.date_fin)}`;
            alertePeriode.classList.add('alert-warning');
        }

        if (!alertePeriode.textContent) {
            alertePeriode.textContent = '✓ Période valide';
        }
        
        resumeDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur calcul:', error);
    }
    updateBtnValiderAdmin();
}

// Fonction de surlignage des jours
function surlignerJoursPrevisualisation(dateDebut, dateFin) {
    document.querySelectorAll('#calendrierAnnuelUser .jour.preview').forEach(j => j.classList.remove('preview'));
    if (!dateDebut || !dateFin) return;
    document.querySelectorAll('#calendrierAnnuelUser .jour[data-date]').forEach(jourDiv => {
        if (jourDiv.dataset.date >= dateDebut && jourDiv.dataset.date <= dateFin) {
            jourDiv.classList.add('preview');
        }
    });
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
// ========== GESTION DES TYPES DE CONGÉS ==========

async function chargerConfigTraitements() {
    try {
        const config = await window.api.getConfigTraitements();
        
        // CP Annuel
        const cpConfig = config.find(c => c.type === 'CP_ANNUEL');
        if (cpConfig) {
            document.getElementById('cpJour').value = cpConfig.jour;
            document.getElementById('cpMois').value = cpConfig.mois;
        }
        
        // RTT Annuel
        const rttConfig = config.find(c => c.type === 'RTT_ANNUEL');
        if (rttConfig) {
            document.getElementById('rttJour').value = rttConfig.jour;
            document.getElementById('rttMois').value = rttConfig.mois;
        }
        
        // Charger l'historique
        await chargerHistoriqueTraitements();
        
    } catch (error) {
        console.error('Erreur chargement config:', error);
    }
}

async function chargerHistoriqueTraitements() {
    try {
        const historique = await window.api.getHistoriqueTraitements();
        const tbody = document.getElementById('historiqueBody');
        
        const historiqueContainer = document.querySelector('.historique-traitements');

        // Garder uniquement le traitement le plus récent par type
        const dernierParType = [];
        ['CP_ANNUEL', 'RTT_ANNUEL'].forEach(type => {
            const derniere = historique.find(h => h.type === type);
            if (derniere) dernierParType.push(derniere);
        });

        if (dernierParType.length === 0) {
            historiqueContainer.style.display = 'none';
            document.getElementById('cpDernierTraitement').textContent = 'Jamais effectué';
            document.getElementById('rttDernierTraitement').textContent = 'Jamais effectué';
            return;
        }
        historiqueContainer.style.display = '';

        tbody.innerHTML = dernierParType.map(h => {
            const dateStr = h.date_execution.includes('Z') ? h.date_execution : h.date_execution + 'Z';
            const date = new Date(dateStr);
            const dateFormatee = date.toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Paris'
            });

            const typeLabel = h.type === 'CP_ANNUEL' ? 'CP Annuel' : 'RTT Annuel';
            const statutLabel = {
                'success': '✅ Réussi',
                'error': '❌ Erreur',
                'partial': '⚠️ Partiel'
            }[h.statut] || h.statut;

            return `
                <tr>
                    <td><strong>${typeLabel}</strong></td>
                    <td>${dateFormatee}</td>
                    <td>${h.annee}</td>
                    <td>${h.nb_salaries_traites} salarié(s)</td>
                    <td><span class="statut-badge statut-${h.statut}">${statutLabel}</span></td>
                </tr>
            `;
        }).join('');
        
        // Mettre à jour les derniers traitements
        const dernierCP = historique.find(h => h.type === 'CP_ANNUEL');
        const dernierRTT = historique.find(h => h.type === 'RTT_ANNUEL');
        
        if (dernierCP) {
            const date = new Date(dernierCP.date_execution).toLocaleDateString('fr-FR');
            document.getElementById('cpDernierTraitement').innerHTML = 
                `${date} - ${dernierCP.nb_salaries_traites} salarié(s) - <span class="statut-badge statut-${dernierCP.statut}">${dernierCP.statut}</span>`;
        } else {
            document.getElementById('cpDernierTraitement').textContent = 'Jamais effectué';
        }
        
        if (dernierRTT) {
            const date = new Date(dernierRTT.date_execution).toLocaleDateString('fr-FR');
            document.getElementById('rttDernierTraitement').innerHTML = 
                `${date} - ${dernierRTT.nb_salaries_traites} salarié(s) - <span class="statut-badge statut-${dernierRTT.statut}">${dernierRTT.statut}</span>`;
        } else {
            document.getElementById('rttDernierTraitement').textContent = 'Jamais effectué';
        }
        
    } catch (error) {
        console.error('Erreur chargement historique:', error);
    }
}

// Générer les options de jours (1-31)
function genererOptionsJours() {
    const selects = document.querySelectorAll('.select-jour');
    const options = Array.from({length: 31}, (_, i) => 
        `<option value="${i + 1}">${i + 1}</option>`
    ).join('');
    
    selects.forEach(select => {
        select.innerHTML = options;
    });
}

// Enregistrer la configuration
document.getElementById('btnEnregistrerConfig').addEventListener('click', async () => {
    const cpJour = parseInt(document.getElementById('cpJour').value);
    const cpMois = parseInt(document.getElementById('cpMois').value);
    const rttJour = parseInt(document.getElementById('rttJour').value);
    const rttMois = parseInt(document.getElementById('rttMois').value);
    
    if (!confirm('Voulez-vous enregistrer cette configuration ?\n\nLes modifications seront prises en compte pour les prochains traitements automatiques.')) {
        return;
    }
    
    const btn = document.getElementById('btnEnregistrerConfig');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
    
    try {
        await window.api.updateConfigTraitement('CP_ANNUEL', cpJour, cpMois);
        await window.api.updateConfigTraitement('RTT_ANNUEL', rttJour, rttMois);
        
        alert('✅ Configuration enregistrée avec succès !');
        await chargerConfigTraitements();
        
    } catch (error) {
        console.error('Erreur:', error);
        alert('❌ Erreur lors de l\'enregistrement de la configuration');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-save"></i> Enregistrer la configuration';
    }
});

// ========== FILE D'ATTENTE DES TOASTS ==========

const _toastQueue = [];
let _toastActif = false;

function afficherNotificationPersistante(type, titre, message) {
    _toastQueue.push({ type, titre, message });
    _afficherProchainToast();
}

function _afficherProchainToast() {
    if (_toastActif || _toastQueue.length === 0) return;
    _toastActif = true;
    const { type, titre, message } = _toastQueue.shift();
    _rendreToast(type, titre, message);
}

function _rendreToast(type, titre, message) {
    const toast = document.createElement('div');
    toast.className = `notification-persistante ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `
        <div class="notification-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="notification-content">
            <h4>${titre}</h4>
            <p>${message}</p>
        </div>
        <button class="notification-close"><i class="fa-solid fa-times"></i></button>
    `;

    document.body.appendChild(toast);

    toast.querySelector('.notification-close').addEventListener('click', () => {
        toast.remove();
        _toastActif = false;
        _afficherProchainToast();
    });
}

// TEST NOTIFICATION
// setTimeout(() => {
//     afficherNotificationPersistante(
//         'error',
//         '✅ Traitement CP Annuel effectué',
//         '8 salarié(s) traité(s) avec succès'
//     );
// }, 2000);
// ========== STATISTIQUES ==========

let chartAbsencesMois = null;
let chartRepartitionType = null;
let donutInitialized = false;

async function chargerStatistiques() {
    const annee = anneeStatistiques;

    if (typeof Chart === 'undefined') {
        console.error('Chart.js non chargé');
        return;
    }

    // Forcer le recalcul du layout avant de créer les graphiques
    const section = document.getElementById('statistiques-section');
    section.offsetHeight; // Force reflow

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const tickColor = isDark ? '#ccc' : '#666';
    const borderColorChart = isDark ? '#1a1a1a' : '#fff';

    try {
        const [absences, salaries] = await Promise.all([
            window.api.getAllAbsences(),
            window.api.getAllSalaries()
        ]);
        // Filtrer les absences de l'année
        const absencesAnnee = absences.filter(a => {
            const debut = a.date_debut.substring(0, 4);
            const fin = a.date_fin.substring(0, 4);
            return debut === String(annee) || fin === String(annee);
        });

        const couleurs = {
            CP_N: 'rgb(0, 108, 137)',
            CP_N1: 'rgb(0, 140, 178)',
            RTT: isDark ? 'rgb(237, 113, 17)' : 'rgb(116, 43, 135)',
            RECUP: 'rgb(181, 22, 63)',
            MALADIE: isDark ? 'rgb(116, 43, 135)' : 'rgb(237, 113, 17)'
        };
        const labels = {
            CP_N: 'CP N',
            CP_N1: 'CP N-1',
            RTT: 'RTT',
            RECUP: 'Récupération',
            MALADIE: 'Maladie'
        };

        // === 1. Absences par mois (barres empilées) ===
        const moisLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const types = Object.keys(couleurs);
        const dataMois = {};
        types.forEach(t => { dataMois[t] = new Array(12).fill(0); });

        absencesAnnee.forEach(a => {
            const mois = parseInt(a.date_debut.substring(5, 7)) - 1;
            const type = a.type;
            if (dataMois[type]) {
                dataMois[type][mois] += (a.duree_jours || 0);
            }
        });

        // Fusionner CP_N + CP_N1 en un seul dataset "CP" pour le graphique
        const dataMoisCP = dataMois['CP_N'].map((v, i) => v + dataMois['CP_N1'][i]);
        const chartTypes = [
            { key: 'CP', label: 'CP', data: dataMoisCP, color: couleurs['CP_N'] },
            { key: 'RTT', label: 'RTT', data: dataMois['RTT'], color: couleurs['RTT'] },
            { key: 'RECUP', label: 'Récupération', data: dataMois['RECUP'], color: couleurs['RECUP'] },
            { key: 'MALADIE', label: 'Maladie', data: dataMois['MALADIE'], color: couleurs['MALADIE'] }
        ];

        const ctxMois = document.getElementById('chartAbsencesMois');
        if (chartAbsencesMois) chartAbsencesMois.destroy();
        chartAbsencesMois = new Chart(ctxMois, {
            type: 'bar',
            data: {
                labels: moisLabels,
                datasets: chartTypes.filter(t => t.data.some(v => v > 0)).map(t => ({
                    label: t.label,
                    data: t.data,
                    backgroundColor: t.color,
                    borderColor: borderColorChart,
                    borderWidth: { top: 1, left: 0, right: 0, bottom: 0 },
                    borderRadius: 3
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: tickColor } } },
                scales: {
                    x: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor } },
                    y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Jours', color: tickColor }, grid: { color: gridColor }, ticks: { color: tickColor } }
                }
            }
        });

        // === 2. Répartition par type (donut) — toujours année courante, rendu une seule fois ===
        if (!donutInitialized) {
        const anneeCourante = String(new Date().getFullYear());
        const absencesAnneeCourante = absences.filter(a => {
            const debut = a.date_debut.substring(0, 4);
            const fin = a.date_fin.substring(0, 4);
            return debut === anneeCourante || fin === anneeCourante;
        });
        const totauxParType = {};
        types.forEach(t => { totauxParType[t] = 0; });
        absencesAnneeCourante.forEach(a => {
            if (totauxParType[a.type] !== undefined) {
                totauxParType[a.type] += (a.duree_jours || 0);
            }
        });

        // Calculer les soldes restants globaux (CP + RTT)
        const salariesActifs = salaries.filter(s => s.actif === 1);
        let totalSoldeCP = 0;
        let totalSoldeRTT = 0;
        for (const s of salariesActifs) {
            const soldes = await window.api.getSoldes(s.id, new Date().getFullYear());
            if (soldes) {
                totalSoldeCP += (soldes.cp_n1 + soldes.cp_n);
                totalSoldeRTT += soldes.rtt;
            }
        }
        totalSoldeCP = Math.round(totalSoldeCP * 100) / 100;
        totalSoldeRTT = Math.round(totalSoldeRTT * 100) / 100;

        // Créer un motif hachuré à partir d'une couleur
        function createHatchPattern(color) {
            const c = document.createElement('canvas');
            c.width = 10; c.height = 10;
            const cx = c.getContext('2d');
            cx.fillStyle = color;
            cx.fillRect(0, 0, 10, 10);
            cx.strokeStyle = isDark ? 'rgba(217,217,217,0.5)' : 'rgba(255,255,255,0.5)';
            cx.lineWidth = 2.5;
            cx.beginPath();
            cx.moveTo(0, 10); cx.lineTo(10, 0); cx.stroke();
            cx.beginPath();
            cx.moveTo(-3, 3); cx.lineTo(3, -3); cx.stroke();
            cx.beginPath();
            cx.moveTo(7, 13); cx.lineTo(13, 7); cx.stroke();
            return cx.createPattern(c, 'repeat');
        }

        // Construire segments groupés par type : posés puis restants (adjacents)
        const donutLabels = [];
        const donutData = [];
        const donutColors = [];
        const donutBorderWidths = [];

        // CP : posés + restants (adjacents, pas de bordure entre eux)
        const cpPose = (totauxParType['CP_N'] || 0) + (totauxParType['CP_N1'] || 0);
        if (cpPose > 0 || totalSoldeCP > 0) {
            if (cpPose > 0) {
                donutLabels.push('CP posés');
                donutData.push(Math.round(cpPose * 100) / 100);
                donutColors.push(couleurs['CP_N']);
                donutBorderWidths.push(2);
            }
            if (totalSoldeCP > 0) {
                donutLabels.push('CP restants');
                donutData.push(totalSoldeCP);
                donutColors.push(createHatchPattern(couleurs['CP_N']));
                donutBorderWidths.push(cpPose > 0 ? 0 : 2);
            }
        }

        // RTT : posés + restants
        const rttPose = totauxParType['RTT'] || 0;
        if (rttPose > 0 || totalSoldeRTT > 0) {
            if (rttPose > 0) {
                donutLabels.push('RTT posés');
                donutData.push(Math.round(rttPose * 100) / 100);
                donutColors.push(couleurs['RTT']);
                donutBorderWidths.push(2);
            }
            if (totalSoldeRTT > 0) {
                donutLabels.push('RTT restants');
                donutData.push(totalSoldeRTT);
                donutColors.push(createHatchPattern(couleurs['RTT']));
                donutBorderWidths.push(rttPose > 0 ? 0 : 2);
            }
        }

        // RECUP et MALADIE (pas de solde restant)
        ['RECUP', 'MALADIE'].forEach(t => {
            if (totauxParType[t] > 0) {
                donutLabels.push(labels[t]);
                donutData.push(Math.round(totauxParType[t] * 100) / 100);
                donutColors.push(couleurs[t]);
                donutBorderWidths.push(2);
            }
        });

        const ctxType = document.getElementById('chartRepartitionType');
        if (chartRepartitionType) chartRepartitionType.destroy();
        chartRepartitionType = new Chart(ctxType, {
            type: 'doughnut',
            data: {
                labels: donutLabels,
                datasets: [{
                    data: donutData,
                    backgroundColor: donutColors,
                    borderColor: 'transparent',
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: tickColor } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label} : ${ctx.parsed} jours`
                        }
                    }
                }
            }
        });
        donutInitialized = true;

        } // fin if (!donutInitialized)

        // === 3. Détail des absences par salarié (tableau avec filtres) ===
        const tableContainer = document.getElementById('tableAbsencesSalaries');
        const absencesDetail = absencesAnnee
            .filter(a => a.statut === 'valide')
            .sort((a, b) => a.date_debut.localeCompare(b.date_debut));

        // Associer les noms des salariés
        const salariesMap = {};
        salaries.forEach(s => { salariesMap[s.id] = `${s.prenom} ${s.nom}`; });

        const formatDate = (d) => {
            const dt = new Date(d + 'T00:00:00');
            return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const typeColors = {
            CP: isDark ? 'var(--jaune)' : 'var(--bleu)',
            CP_N: isDark ? 'var(--jaune)' : 'var(--bleu)',
            CP_N1: isDark ? 'var(--jaune)' : 'var(--bleu)',
            RTT: isDark ? 'var(--orange)' : 'var(--mauve)',
            RECUP: 'var(--rouge)',
            MALADIE: isDark ? 'var(--mauve)' : 'var(--orange)'
        };

        const filtreTypes = ['CP', 'RTT', 'RECUP', 'MALADIE'];
        const filtreLabels = { CP: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };

        function renderTableauAbsences() {
            const typesCoches = filtreTypes.filter(t => {
                const cb = document.getElementById('filtreStats_' + t);
                return cb && cb.checked;
            });

            const moisFiltre = parseInt(document.getElementById('filtreStatsMois').value);

            const filtered = absencesDetail.filter(a => {
                const typeOk = (a.type === 'CP_N' || a.type === 'CP_N1' || a.type === 'CP') ? typesCoches.includes('CP') : typesCoches.includes(a.type);
                if (!typeOk) return false;
                if (moisFiltre > 0) {
                    const moisDebut = parseInt(a.date_debut.substring(5, 7));
                    const moisFin = parseInt(a.date_fin.substring(5, 7));
                    if (moisDebut !== moisFiltre && moisFin !== moisFiltre) return false;
                }
                return true;
            });

            const tbody = tableContainer.querySelector('.stats-absences-tbody');
            if (!tbody) return;

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999; padding:20px;">Aucune absence pour cette sélection</td></tr>';
            } else {
                // Grouper par salarié puis par type
                const grouped = {};
                filtered.forEach(a => {
                    const nom = salariesMap[a.salarie_id] || 'Inconnu';
                    if (!grouped[nom]) grouped[nom] = {};
                    const typeLabel = (a.type === 'CP_N' || a.type === 'CP_N1') ? 'CP' : a.type;
                    if (!grouped[nom][typeLabel]) grouped[nom][typeLabel] = [];
                    grouped[nom][typeLabel].push(a);
                });

                let html = '';
                const nomsTriés = Object.keys(grouped).sort();
                const typeOrdre = ['CP', 'RTT', 'RECUP', 'MALADIE'];

                nomsTriés.forEach(nom => {
                    const typesPresents = typeOrdre.filter(t => grouped[nom][t]);
                    const nbLignes = typesPresents.reduce((sum, t) => sum + grouped[nom][t].length, 0);

                    let first = true;
                    typesPresents.forEach(typeLabel => {
                        const absences = grouped[nom][typeLabel];
                        absences.forEach((a, i) => {
                            html += '<tr>';
                            if (first) {
                                html += `<td class="stats-cell-salarie" rowspan="${nbLignes}"><strong>${nom}</strong></td>`;
                                first = false;
                            }
                            if (i === 0) {
                                html += `<td rowspan="${absences.length}"><span style="color:${typeColors[typeLabel] || '#333'}; font-weight:600;">${typeLabel}</span></td>`;
                            }
                            html += `<td>${formatDate(a.date_debut)}</td>`;
                            html += `<td>${formatDate(a.date_fin)}</td>`;
                            html += `<td>${a.duree_jours || '-'}</td>`;
                            html += '</tr>';
                        });
                    });
                });

                tbody.innerHTML = html;
            }
        }

        const moisOptions = ['Tous', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

        // Construire les checkboxes + select mois + tableau
        tableContainer.innerHTML = `
            <div class="stats-filtres">
                <span class="stats-filtre-titre">Type :</span>
                ${filtreTypes.map(t => `
                    <label class="stats-filtre-label">
                        <input type="checkbox" id="filtreStats_${t}" checked>
                        <span style="color:${typeColors[t]}">${filtreLabels[t]}</span>
                    </label>
                `).join('')}
                <div class="stats-filtre-right">
                    <span class="stats-filtre-titre">Période :</span>
                    <select id="filtreStatsMois" class="stats-filtre-mois">
                        ${moisOptions.map((m, i) => `<option value="${i}" ${i === new Date().getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                    <button id="btnExportStatsPDF" class="btn-stats-pdf" title="Exporter en PDF">
                        <i class="fa-solid fa-file-pdf"></i>
                    </button>
                </div>
            </div>
            <div class="stats-table-scroll">
                <table class="table-stats-absences">
                    <thead>
                        <tr>
                            <th>Salarié</th>
                            <th>Type</th>
                            <th>Du</th>
                            <th>Au</th>
                            <th>Jours</th>
                        </tr>
                    </thead>
                    <tbody class="stats-absences-tbody"></tbody>
                </table>
            </div>
        `;

        // Listeners sur les checkboxes et le select mois
        filtreTypes.forEach(t => {
            document.getElementById('filtreStats_' + t).addEventListener('change', renderTableauAbsences);
        });
        document.getElementById('filtreStatsMois').addEventListener('change', renderTableauAbsences);

        document.getElementById('btnExportStatsPDF').addEventListener('click', async () => {
            const typesCoches = filtreTypes.filter(t => {
                const cb = document.getElementById('filtreStats_' + t);
                return cb && cb.checked;
            });
            const moisFiltre = parseInt(document.getElementById('filtreStatsMois').value);

            const filtered = absencesDetail.filter(a => {
                const typeOk = (a.type === 'CP_N' || a.type === 'CP_N1' || a.type === 'CP') ? typesCoches.includes('CP') : typesCoches.includes(a.type);
                if (!typeOk) return false;
                if (moisFiltre > 0) {
                    const moisDebut = parseInt(a.date_debut.substring(5, 7));
                    const moisFin = parseInt(a.date_fin.substring(5, 7));
                    if (moisDebut !== moisFiltre && moisFin !== moisFiltre) return false;
                }
                return true;
            });

            // Trier par salarié puis par type puis par date
            filtered.sort((a, b) => {
                const nomA = salariesMap[a.salarie_id] || '';
                const nomB = salariesMap[b.salarie_id] || '';
                if (nomA !== nomB) return nomA.localeCompare(nomB);
                const tA = (a.type === 'CP_N' || a.type === 'CP_N1') ? 'CP' : a.type;
                const tB = (b.type === 'CP_N' || b.type === 'CP_N1') ? 'CP' : b.type;
                if (tA !== tB) return tA.localeCompare(tB);
                return a.date_debut.localeCompare(b.date_debut);
            });

            const pdfData = filtered.map(a => ({
                salarie: salariesMap[a.salarie_id] || 'Inconnu',
                type: (a.type === 'CP_N' || a.type === 'CP_N1') ? 'CP' : a.type,
                du: formatDate(a.date_debut),
                au: formatDate(a.date_fin),
                jours: String(a.duree_jours || '-')
            }));

            try {
                await window.api.exporterStatsPDF({
                    annee: anneeStatistiques,
                    mois: moisFiltre,
                    types: typesCoches,
                    absences: pdfData
                });
            } catch (err) {
                console.error('Erreur export PDF stats:', err);
            }
        });

        renderTableauAbsences();

    } catch (error) {
        console.error('Erreur chargement statistiques:', error);
    }
}

// ========== ÉDITEUR DE SOLDES (Ctrl+DEBUG) ==========

let sequence = [];
const secretCode = ['d', 'e', 'b', 'u', 'g'];
let sequenceTimeout;

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();
        sequence.push(letter);
        if (sequence.length > 5) sequence.shift();

        if (sequence.join('') === secretCode.join('')) {
            e.preventDefault();
            ouvrirEditeurSoldes();
            sequence = [];
            clearTimeout(sequenceTimeout);
        }

        clearTimeout(sequenceTimeout);
        sequenceTimeout = setTimeout(() => { sequence = []; }, 2000);
    }
});

async function ouvrirEditeurSoldes() {
    const modal = document.getElementById('modalEditSoldes');
    const msg = document.getElementById('editSoldesMsg');
    msg.textContent = '';
    msg.className = 'edit-soldes-msg';

    await chargerTableSoldes(new Date().getFullYear());
    modal.style.display = 'flex';
}

async function chargerTableSoldes(annee) {
    const container = document.getElementById('editSoldesTable');
    try {
        const salaries = await window.api.getAllSalaries();
        let html = `<table class="soldes-edit-table">
            <thead><tr>
                <th>Salarié</th>
                <th>CP N-1</th>
                <th>CP N</th>
                <th>RTT</th>
                <th>Récup (h)</th>
            </tr></thead><tbody>`;

        for (const s of salaries) {
            const soldes = await window.api.getSoldes(s.id, annee);
            const cpN1 = soldes ? soldes.cp_n1 : 0;
            const cpN = soldes ? soldes.cp_n : 0;
            const rtt = soldes ? soldes.rtt : 0;
            const recup = soldes ? soldes.recup_heures : 0;

            html += `<tr data-salarie-id="${s.id}">
                <td class="salarie-name">${s.nom} ${s.prenom}</td>
                <td><input type="number" step="0.01" class="edit-cp-n1" value="${cpN1}"></td>
                <td><input type="number" step="0.01" class="edit-cp-n" value="${cpN}"></td>
                <td><input type="number" step="0.01" class="edit-rtt" value="${rtt}" ${s.a_droit_rtt ? '' : 'disabled title="Pas de droit RTT"'}></td>
                <td><input type="number" step="0.1" class="edit-recup" value="${recup}" ${s.a_droit_recup ? '' : 'disabled title="Pas de droit récup"'}></td>
            </tr>`;
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Erreur chargement soldes:', err);
        container.innerHTML = '<p style="color:red">Erreur au chargement des soldes</p>';
    }
}

// Fermer
document.getElementById('closeModalEditSoldes').addEventListener('click', () => {
    document.getElementById('modalEditSoldes').style.display = 'none';
});
document.getElementById('btnAnnulerSoldes').addEventListener('click', () => {
    document.getElementById('modalEditSoldes').style.display = 'none';
});

// Sauvegarder
document.getElementById('btnSauverSoldes').addEventListener('click', async () => {
    const annee = new Date().getFullYear();
    const rows = document.querySelectorAll('#editSoldesTable tbody tr');
    const msg = document.getElementById('editSoldesMsg');
    const btn = document.getElementById('btnSauverSoldes');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';

    try {
        for (const row of rows) {
            const salarieId = parseInt(row.dataset.salarieId);
            const cpN1 = parseFloat(row.querySelector('.edit-cp-n1').value) || 0;
            const cpN = parseFloat(row.querySelector('.edit-cp-n').value) || 0;
            const rtt = parseFloat(row.querySelector('.edit-rtt').value) || 0;
            const recup = parseFloat(row.querySelector('.edit-recup').value) || 0;

            await window.api.updateSoldes(salarieId, annee, { cp_n1: cpN1, cp_n: cpN, rtt, recup_heures: recup });
        }

        msg.textContent = 'Soldes enregistrés avec succès !';
        msg.className = 'edit-soldes-msg success';
        setTimeout(() => { msg.textContent = ''; msg.className = 'edit-soldes-msg'; }, 3000);

        // Rafraîchir les soldes admin si on est sur l'année courante
        await loadSoldesAdmin();

    } catch (err) {
        console.error('Erreur sauvegarde soldes:', err);
        msg.textContent = 'Erreur lors de l\'enregistrement : ' + err.message;
        msg.className = 'edit-soldes-msg error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer';
    }
});
// ========== CODE SECRET POUR IMPORT EXCEL ==========
// Séquence : Ctrl+I, Ctrl+M, Ctrl+P, Ctrl+O, Ctrl+R, Ctrl+T

let sequenceImport = [];
const secretCodeImport = ['l', 'o', 'a', 'd'];
let sequenceTimeoutImport;

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();

        sequenceImport.push(letter);

        if (sequenceImport.length > 4) {
            sequenceImport.shift();
        }

        if (sequenceImport.join('') === secretCodeImport.join('')) {
            e.preventDefault();
            document.getElementById('modalImport').style.display = 'flex';
            sequenceImport = [];
            clearTimeout(sequenceTimeoutImport);
        }

        clearTimeout(sequenceTimeoutImport);
        sequenceTimeoutImport = setTimeout(() => {
            sequenceImport = [];
        }, 2000);
    }
});

// ========== GESTION MODALE IMPORT ==========

// Fermer la modale
document.getElementById('closeModalImport').addEventListener('click', () => {
    document.getElementById('modalImport').style.display = 'none';
    resetImportModal();
});

// Sélection du fichier
document.getElementById('btnSelectFileImport').addEventListener('click', () => {
    document.getElementById('fileImportExcel').click();
});

// Lecture du fichier
document.getElementById('fileImportExcel').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('fileNameImport').textContent = file.name;
    document.getElementById('fileSelectedImport').style.display = 'flex';
    
    // Lire le fichier
    try {
        const btn = document.getElementById('btnSelectFileImport');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lecture en cours...';
        
        const data = await lireExcelImport(file);
        
        // Afficher la prévisualisation
        afficherPreviewImport(data);
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Sélectionner un autre fichier';
        
    } catch (error) {
        console.error('Erreur lecture fichier:', error);
        alert('❌ Erreur lors de la lecture du fichier : ' + error.message);
        
        document.getElementById('btnSelectFileImport').disabled = false;
        document.getElementById('btnSelectFileImport').innerHTML = '<i class="fa-solid fa-folder-open"></i> Sélectionner le fichier';
    }
});

// Retour à l'étape 1
document.getElementById('btnCancelImportModal').addEventListener('click', () => {
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStep1').style.display = 'block';
});

// Confirmer l'import
document.getElementById('btnConfirmImportModal').addEventListener('click', async () => {
    const btn = document.getElementById('btnConfirmImportModal');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Import en cours...';
    
    try {
        await executerImport();
    } catch (error) {
        console.error('Erreur import:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmer l\'import';
    }
});

// Fermer le résultat
document.getElementById('btnCloseImportResult').addEventListener('click', () => {
    document.getElementById('modalImport').style.display = 'none';
    resetImportModal();
});

// Réinitialiser la modale
function resetImportModal() {
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importStep3').style.display = 'none';
    document.getElementById('fileImportExcel').value = '';
    document.getElementById('fileSelectedImport').style.display = 'none';
    document.getElementById('btnSelectFileImport').disabled = false;
    document.getElementById('btnSelectFileImport').innerHTML = '<i class="fa-solid fa-folder-open"></i> Sélectionner le fichier';
}

// Variable globale pour stocker les données
let dataImportGlobal = null;

// Fonction pour lire le fichier Excel
async function lireExcelImport(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                // Utiliser la librairie XLSX (déjà disponible)
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Chercher l'onglet "Archives"
                if (!workbook.SheetNames.includes('Archives')) {
                    reject(new Error('Onglet "Archives" introuvable dans le fichier'));
                    return;
                }
                
                const worksheet = workbook.Sheets['Archives'];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                // Parser les données
                const parsed = parseDataExcel(jsonData);
                
                resolve(parsed);
                
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Erreur lecture fichier'));
        reader.readAsArrayBuffer(file);
    });
}

// Parser les données Excel
// Parser les données Excel
function parseDataExcel(jsonData) {
    // Trouver la ligne d'en-tête (chercher "PERSONNE")
    let headerRow = -1;
    let colonnePersonne = -1;
    
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        for (let j = 0; j < jsonData[i].length; j++) {
            if (jsonData[i][j] && jsonData[i][j].toString().includes('PERSONNE')) {
                headerRow = i;
                colonnePersonne = j;
                break;
            }
        }
        if (headerRow !== -1) break;
    }
    
    if (headerRow === -1) {
        throw new Error('En-tête introuvable (colonne PERSONNE non trouvée)');
    }
    
    console.log(`📌 En-tête trouvé ligne ${headerRow}, colonne PERSONNE à l'index ${colonnePersonne}`);
    
    const data = [];
    
    // Parser chaque ligne
    for (let i = headerRow + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Ignorer les lignes vides
        if (!row || row.length === 0) continue;
        
        // Lire PERSONNE à l'index détecté
        const personne = row[colonnePersonne] ? row[colonnePersonne].toString().trim() : '';
        if (!personne || personne === '') continue;
        
        // Les autres colonnes sont décalées selon colonnePersonne
        const ligne = {
            personne: personne,
            date: row[colonnePersonne + 1] ? row[colonnePersonne + 1] : '', // Date d'absence
            nature: row[colonnePersonne + 2] ? row[colonnePersonne + 2].toString().trim() : '', // Nature
            jour: row[colonnePersonne + 3] ? parseInt(row[colonnePersonne + 3]) : 0,
            mois: row[colonnePersonne + 4] ? parseInt(row[colonnePersonne + 4]) : 0,
            annee: row[colonnePersonne + 5] ? parseInt(row[colonnePersonne + 5]) : 0,
            duree: row[colonnePersonne + 6] ? parseFloat(row[colonnePersonne + 6]) : 1,
            periode: row[colonnePersonne + 7] ? row[colonnePersonne + 7].toString().trim() : 'Journée'
        };
        
        data.push(ligne);
    }
    
    return data;
}

// Afficher la prévisualisation
function afficherPreviewImport(data) {
    dataImportGlobal = data;
    
    // Statistiques
    const nbLignes = data.length;
    const personnes = [...new Set(data.map(d => d.personne))];
    const annees = [...new Set(data.map(d => d.annee))];
    
    document.getElementById('previewStatsImport').innerHTML = `
        <p><strong>${nbLignes}</strong> lignes trouvées</p>
        <p><strong>${personnes.length}</strong> personnes distinctes</p>
        <p><strong>Années :</strong> ${annees.sort().join(', ')}</p>
    `;
    
    // Tableau (5 premières lignes)
    const preview = data.slice(0, 10);
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Personne</th>
                    <th>Date</th>
                    <th>Nature</th>
                    <th>Durée</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    preview.forEach(ligne => {
        tableHTML += `
            <tr>
                <td>${ligne.personne}</td>
                <td>${ligne.jour}/${ligne.mois}/${ligne.annee}</td>
                <td>${ligne.nature}</td>
                <td>${ligne.duree}j</td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table>';
    
    if (data.length > 10) {
        tableHTML += `<p style="text-align: center; color: #999; margin-top: 10px;">... et ${data.length - 10} autres lignes</p>`;
    }
    
    document.getElementById('previewTableImport').innerHTML = tableHTML;
    
    // Passer à l'étape 2
    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importStep2').style.display = 'block';
}

// Fonction pour exécuter l'import (on va la coder après)
// Fonction pour exécuter l'import
async function executerImport() {
    try {
        // Passer à l'étape 3
        document.getElementById('importStep2').style.display = 'none';
        document.getElementById('importStep3').style.display = 'block';
        
        document.getElementById('importResultModal').innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 3em; color: var(--bleu);"></i>
                <p style="margin-top: 20px; font-size: 1.1em;">Import en cours...</p>
            </div>
        `;
        
        // Regrouper les données par personne
        const parPersonne = {};
        dataImportGlobal.forEach(ligne => {
            if (!parPersonne[ligne.personne]) {
                parPersonne[ligne.personne] = [];
            }
            parPersonne[ligne.personne].push(ligne);
        });
        
        // Statistiques
        let nbAbsencesCreees = 0;
        let nbDoublons = 0;
        let nbErreursPersonne = 0;
        let nbErreursLignes = 0;
        const details = [];
        const erreurs = [];
        
        // Pour chaque personne
        for (const [nomComplet, lignes] of Object.entries(parPersonne)) {
            try {
                // Chercher le salarié dans la base
                const salarie = await trouverSalarie(nomComplet);
                
                if (!salarie) {
                    nbErreursPersonne++;
                    erreurs.push(`❌ ${nomComplet} : Salarié introuvable dans la base`);
                    continue;
                }
                
                // Trier par date
                lignes.sort((a, b) => {
                    const dateA = new Date(a.annee, a.mois - 1, a.jour);
                    const dateB = new Date(b.annee, b.mois - 1, b.jour);
                    return dateA - dateB;
                });
                
                // Regrouper les jours consécutifs
                const absences = regrouperAbsencesConsecutives(lignes);
                
                // Créer les absences
                for (const absence of absences) {
                    try {
                        await creerAbsenceImport(salarie.id, absence);
                        nbAbsencesCreees++;
                    } catch (error) {
                        if (error.message.includes('Doublon')) {
                            nbDoublons++;
                        } else {
                            nbErreursLignes++;
                            erreurs.push(`❌ ${nomComplet} (${absence.date_debut} - ${absence.date_fin}) : ${error.message}`);
                        }
                    }
                }
                
                details.push(`✅ ${nomComplet} : ${absences.length} absence(s) créée(s)`);
                
            } catch (error) {
                nbErreursPersonne++;
                erreurs.push(`❌ ${nomComplet} : ${error.message}`);
            }
        }
        
        // Log dans historique_traitements
        try {
            await window.api.logHistoriqueTraitement({
                type: 'IMPORT_EXCEL',
                annee: new Date().getFullYear(),
                nb_salaries_traites: Object.keys(parPersonne).length - nbErreursPersonne,
                details: `${nbAbsencesCreees} créée(s), ${nbDoublons} doublon(s), ${nbErreursLignes} erreur(s), ${nbErreursPersonne} introuvable(s)`,
                statut: (nbErreursPersonne === 0 && nbErreursLignes === 0) ? 'success' : 'partial',
                message_erreur: erreurs.length > 0 ? erreurs.join(' | ') : ''
            });
        } catch (logErr) {
            console.error('Erreur log historique:', logErr);
        }

        // Afficher le résultat
        let resultHTML = '';

        if (nbErreursPersonne === 0 && nbErreursLignes === 0) {
            resultHTML += `
                <div class="import-success">
                    <h4>✅ Import réussi !</h4>
                    <p><strong>${nbAbsencesCreees}</strong> absence(s) créée(s) pour <strong>${Object.keys(parPersonne).length}</strong> personne(s)</p>
                    ${nbDoublons > 0 ? `<p><strong>${nbDoublons}</strong> doublon(s) ignoré(s)</p>` : ''}
                </div>
            `;
        } else {
            resultHTML += `
                <div class="import-error">
                    <h4>⚠️ Import terminé avec des avertissements</h4>
                    <p><strong>${nbAbsencesCreees}</strong> absence(s) créée(s)</p>
                    ${nbDoublons > 0 ? `<p><strong>${nbDoublons}</strong> doublon(s) ignoré(s)</p>` : ''}
                    ${nbErreursPersonne > 0 ? `<p><strong>${nbErreursPersonne}</strong> personne(s) non trouvée(s)</p>` : ''}
                    ${nbErreursLignes > 0 ? `<p><strong>${nbErreursLignes}</strong> ligne(s) en erreur</p>` : ''}
                </div>
            `;
        }
        
        // Détails
        resultHTML += '<div class="import-details">';
        
        if (details.length > 0) {
            resultHTML += '<h5>✅ Succès :</h5>';
            details.forEach(d => {
                resultHTML += `<div class="import-detail-item">${d}</div>`;
            });
        }
        
        if (erreurs.length > 0) {
            resultHTML += '<h5 style="margin-top: 15px;">❌ Erreurs :</h5>';
            erreurs.forEach(e => {
                resultHTML += `<div class="import-detail-item" style="border-left-color: #dc3545;">${e}</div>`;
            });
        }
        
        resultHTML += '</div>';
        
        document.getElementById('importResultModal').innerHTML = resultHTML;
        
    } catch (error) {
        console.error('Erreur import:', error);
        document.getElementById('importResultModal').innerHTML = `
            <div class="import-error">
                <h4>❌ Erreur critique</h4>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Fonction pour trouver un salarié par nom complet
async function trouverSalarie(nomComplet) {
    const salaries = await window.api.getAllSalaries();
    
    // Essayer différents formats
    const formats = [
        nomComplet.toUpperCase(),
        nomComplet.toLowerCase(),
        // "NOM Prenom" -> chercher par nom et prénom
    ];
    
    // Extraire nom et prénom
    const parts = nomComplet.split(' ');
    
    for (const salarie of salaries) {
        const nomSalarie = `${salarie.nom} ${salarie.prenom}`;
        const nomSalarieInverse = `${salarie.prenom} ${salarie.nom}`;
        
        if (nomSalarie.toUpperCase() === nomComplet.toUpperCase() ||
            nomSalarieInverse.toUpperCase() === nomComplet.toUpperCase()) {
            return salarie;
        }
        
        // Essayer avec juste le nom
        if (parts.length >= 2) {
            const nom = parts[0];
            const prenom = parts.slice(1).join(' ');
            
            if (salarie.nom.toUpperCase() === nom.toUpperCase() &&
                salarie.prenom.toUpperCase() === prenom.toUpperCase()) {
                return salarie;
            }
        }
    }
    
    return null;
}

// Fonction pour regrouper les absences consécutives
function regrouperAbsencesConsecutives(lignes) {
    const absences = [];
    let absenceCourante = null;
    
    lignes.forEach((ligne, index) => {
        const dateJour = new Date(ligne.annee, ligne.mois - 1, ligne.jour);
        
        // Mapper le type
        let type = 'CP_N';
        const natureLower = ligne.nature.toLowerCase();
        if (natureLower.includes('maladie') || natureLower.includes('arrêt') || natureLower.includes('arret')) type = 'MALADIE';
        else if (natureLower.includes('recup')) type = 'RECUP';
        else if (natureLower.includes('rtt')) type = 'RTT';
        else if (natureLower.includes('anticipé')) type = 'CP_N';
        else if (natureLower.includes('cp')) type = 'CP_N';
        
        if (!absenceCourante) {
            // Première absence
            absenceCourante = {
                type,
                date_debut: formatDateISO(dateJour),
                date_fin: formatDateISO(dateJour),
                duree_jours: ligne.duree,
                duree_heures: ligne.duree * 7
            };
        } else {
            // Vérifier si c'est le jour suivant et même type
            const dateFinCourante = new Date(absenceCourante.date_fin);
            const jourSuivant = new Date(dateFinCourante);
            jourSuivant.setDate(jourSuivant.getDate() + 1);
            
            // Ignorer les weekends
            while (jourSuivant.getDay() === 0 || jourSuivant.getDay() === 6) {
                jourSuivant.setDate(jourSuivant.getDate() + 1);
            }
            
            if (formatDateISO(dateJour) === formatDateISO(jourSuivant) && type === absenceCourante.type) {
                // Prolonger l'absence courante
                absenceCourante.date_fin = formatDateISO(dateJour);
                absenceCourante.duree_jours += ligne.duree;
                absenceCourante.duree_heures += ligne.duree * 7;
            } else {
                // Nouvelle absence
                absences.push(absenceCourante);
                absenceCourante = {
                    type,
                    date_debut: formatDateISO(dateJour),
                    date_fin: formatDateISO(dateJour),
                    duree_jours: ligne.duree,
                    duree_heures: ligne.duree * 7
                };
            }
        }
        
        // Dernière ligne
        if (index === lignes.length - 1 && absenceCourante) {
            absences.push(absenceCourante);
        }
    });
    
    return absences;
}

// Fonction pour formater une date en ISO
function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Fonction pour créer une absence (avec détection doublons)
async function creerAbsenceImport(salarieId, absence) {
    // Vérifier si une absence identique existe déjà
    const existantes = await window.api.getAbsences(salarieId);
    const doublon = existantes.find(a =>
        a.date_debut === absence.date_debut &&
        a.date_fin === absence.date_fin &&
        a.type === absence.type
    );
    if (doublon) {
        throw new Error('Doublon détecté (absence déjà existante)');
    }

    const absenceData = {
        salarie_id: salarieId,
        type: absence.type,
        date_debut: absence.date_debut,
        date_fin: absence.date_fin,
        duree_jours: absence.duree_jours,
        duree_heures: absence.duree_heures,
        commentaire: 'Import historique',
        autoValide: true,
        skipNotification: true
    };

    return await window.api.createAbsence(absenceData);
}
// Écouter les traitements automatiques depuis le main process
if (window.api.onTraitementAutomatique) {
    window.api.onTraitementAutomatique((data) => {
        console.log('Traitement automatique reçu:', data);

        // Notifs du workflow de validation — toast direct + refresh bandeau/badge
        if (data.type === 'demande_conge' || data.type === 'demande_validee' || data.type === 'demande_refusee') {
            // Si la notif est ciblée vers un user spécifique, n'afficher que sur son poste
            if (data.user_id && data.user_id !== user.id) return;
            const statutToast = data.statut === 'error' ? 'error'
                              : data.statut === 'success' ? 'success'
                              : 'partial'; // info mappé à partial (bleu/orange doux)
            afficherNotificationPersistante(statutToast, data.titre || 'Notification', data.message || '');
            chargerNotificationsNonLues();
            loadDemandesEnAttente();
            return;
        }

        const typeLabel = data.type === 'CP_ANNUEL' ? 'CP Annuel'
            : data.type === 'RTT_ANNUEL' ? 'RTT Annuel'
            : (typeof data.type === 'string' && data.type.startsWith('CP_MENSUEL')) ? 'CP Mensuel'
            : data.type;

        if (data.statut === 'success') {
            afficherNotificationPersistante(
                'success',
                `Traitement ${typeLabel} effectué`,
                `${data.nbSalaries} salarié(s) traité(s) avec succès`
            );
        } else {
            afficherNotificationPersistante(
                'error',
                `Erreur traitement ${typeLabel}`,
                data.erreurs ? data.erreurs.join(', ') : 'Une erreur est survenue'
            );
        }

        // Rafraîchir le badge depuis la DB (la notif y est sauvegardée)
        chargerNotificationsNonLues();

        // Recharger l'historique
        chargerHistoriqueTraitements();
    });
}
// ========== CODE SECRET POUR EXPORT EXCEL ==========
// Séquence : Ctrl+S, Ctrl+A, Ctrl+V, Ctrl+E

let sequenceExport = [];
const secretCodeExport = ['s', 'a', 'v', 'e'];
let sequenceTimeoutExport;

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();

        sequenceExport.push(letter);

        if (sequenceExport.length > 4) {
            sequenceExport.shift();
        }

        if (sequenceExport.join('') === secretCodeExport.join('')) {
            e.preventDefault();
            executerExport();
            sequenceExport = [];
            clearTimeout(sequenceTimeoutExport);
        }

        clearTimeout(sequenceTimeoutExport);
        sequenceTimeoutExport = setTimeout(() => {
            sequenceExport = [];
        }, 2000);
    }
});
// ========== FONCTION EXPORT EXCEL ==========

async function executerExport() {
    try {
        afficherNotificationPersistante('success', '📊 Export en cours...', 'Génération du fichier Excel');
        
        // Récupérer toutes les données
        const salaries = await window.api.getAllSalaries();
        const annee = new Date().getFullYear();
        
        // Créer un nouveau workbook
        const wb = XLSX.utils.book_new();
        
        // ========== ONGLET 1 : SOLDES ==========
        const dataSoldes = [
            ['Nom', 'Prénom', 'Email', 'Type Contrat', 'Arrêt maladie', 'RTT', 'Récup', 'CP N-1', 'CP N', 'RTT', 'Récup (h)']
        ];
        
        for (const salarie of salaries) {
            if (salarie.actif !== 1) continue;
            
            const soldes = await window.api.getSoldes(salarie.id, annee);
            
            dataSoldes.push([
                salarie.nom,
                salarie.prenom,
                salarie.email,
                salarie.type_contrat,
                salarie.en_arret_maladie ? 'Oui' : 'Non',
                salarie.a_droit_rtt ? 'Oui' : 'Non',
                salarie.a_droit_recup ? 'Oui' : 'Non',
                soldes ? soldes.cp_n1 : 0,
                soldes ? soldes.cp_n : 0,
                soldes ? soldes.rtt : 0,
                soldes ? soldes.recup_heures : 0
            ]);
        }
        
        const wsSoldes = XLSX.utils.aoa_to_sheet(dataSoldes);
        
        // Largeur des colonnes
        wsSoldes['!cols'] = [
            { wch: 15 }, // Nom
            { wch: 15 }, // Prénom
            { wch: 25 }, // Email
            { wch: 12 }, // Contrat
            { wch: 10 }, // CP/mois
            { wch: 8 },  // RTT
            { wch: 8 },  // Récup
            { wch: 10 }, // CP N-1
            { wch: 10 }, // CP N
            { wch: 10 }, // RTT solde
            { wch: 12 }  // Récup h
        ];
        
        XLSX.utils.book_append_sheet(wb, wsSoldes, 'Soldes');
        
        // ========== ONGLET : ARCHIVES (FORMAT EXACT IMPORT) ==========
const dataArchives = [
    ['', '', '', 'PERSONNE', 'Date d\'absence', 'Nature d\'absence', 'jour', 'mois', 'année', 'journée entiere ou demi journée', 'matin / apres-midi ou Journée']
];

// Pour chaque salarié, récupérer toutes les absences
for (const salarie of salaries) {
    const absences = await window.api.getAbsences(salarie.id);
    
    for (const absence of absences) {
        // Mapper le type vers le format import
        let natureAbsence = 'CP anticipé';
        if (absence.type === 'RTT') natureAbsence = 'RTT';
        else if (absence.type === 'RECUP') natureAbsence = 'RECUP';
        else if (absence.type === 'CP_N1') natureAbsence = 'CP anticipé';
        else if (absence.type === 'CP_N') natureAbsence = 'CP anticipé';
        else if (absence.type === 'MALADIE') natureAbsence = 'MALADIE';
        
        // Décomposer l'absence en jours individuels
        const dateDebut = new Date(absence.date_debut);
        const dateFin = new Date(absence.date_fin);
        
        // Si c'est une demi-journée unique
        if (absence.duree_jours < 1 && dateDebut.getTime() === dateFin.getTime()) {
            const jour = dateDebut.getDate();
            const mois = dateDebut.getMonth() + 1;
            const anneeAbs = dateDebut.getFullYear();
            
            // Date Excel (nombre de jours depuis 1900)
            const dateExcel = new Date(anneeAbs, mois - 1, jour);
            
            dataArchives.push([
                '', '', '', // Colonnes A, B, C vides
                `${salarie.nom} ${salarie.prenom}`,
                dateExcel,
                natureAbsence,
                jour,
                mois,
                anneeAbs,
                0.5,
                'AM'
            ]);
        } else {
            // Décomposer en jours ouvrés uniquement
            let currentDate = new Date(dateDebut);

            while (currentDate <= dateFin) {
                const dayOfWeek = currentDate.getDay();
                // Ignorer weekends (0 = dimanche, 6 = samedi)
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const jour = currentDate.getDate();
                    const mois = currentDate.getMonth() + 1;
                    const anneeAbs = currentDate.getFullYear();

                    dataArchives.push([
                        '', '', '',
                        `${salarie.nom} ${salarie.prenom}`,
                        new Date(anneeAbs, mois - 1, jour),
                        natureAbsence,
                        jour,
                        mois,
                        anneeAbs,
                        1,
                        'Journée'
                    ]);
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
}
}

const wsArchives = XLSX.utils.aoa_to_sheet(dataArchives);

// Largeur des colonnes
wsArchives['!cols'] = [
    { wch: 5 },  // A vide
    { wch: 5 },  // B vide
    { wch: 5 },  // C vide
    { wch: 25 }, // D PERSONNE
    { wch: 15 }, // E Date
    { wch: 20 }, // F Nature
    { wch: 8 },  // G jour
    { wch: 8 },  // H mois
    { wch: 8 },  // I année
    { wch: 12 }, // J durée
    { wch: 30 }  // K période
];

// Formater les dates en format date Excel
const range = XLSX.utils.decode_range(wsArchives['!ref']);
for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: 4 }); // Colonne E
    if (wsArchives[cellAddress] && wsArchives[cellAddress].v instanceof Date) {
        wsArchives[cellAddress].t = 'd';
        wsArchives[cellAddress].z = 'dd/mm/yyyy';
    }
}

XLSX.utils.book_append_sheet(wb, wsArchives, 'Archives');
        
        // ========== GÉNÉRATION ET TÉLÉCHARGEMENT ==========
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        
        // Créer un lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Export_Conges_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        afficherNotificationPersistante('success', '✅ Export réussi !', 'Le fichier a été téléchargé');
        
    } catch (error) {
        console.error('Erreur export:', error);
        afficherNotificationPersistante('error', '❌ Erreur export', error.message);
    }
}
// ========== CHARGEMENT DES NOTIFICATIONS NON LUES ==========

async function chargerNotificationsNonLues() {
    try {
        const notifications = await window.api.getNotificationsNonLues(user.id);
        console.log('📬 Notifications non lues:', notifications.length);
        window._notificationsEnAttente = notifications;
        mettreAJourBadge(notifications.length);
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
    }
}

function mettreAJourBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifDropdown(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;

    if (!notifications || notifications.length === 0) {
        list.innerHTML = '<p class="notif-vide">Aucune notification</p>';
        return;
    }

    list.innerHTML = notifications.map(notif => {
        const statut = notif.statut;
        const type = notif.type || '';
        // Icône par type pour les notifs workflow, sinon par statut
        const icon = type === 'demande_conge' ? 'fa-clock'
                   : type === 'demande_validee' ? 'fa-circle-check'
                   : type === 'demande_refusee' ? 'fa-circle-xmark'
                   : statut === 'success' ? 'fa-check-circle'
                   : statut === 'info' ? 'fa-circle-info'
                   : 'fa-exclamation-circle';
        const cssClass = statut === 'success' ? 'success'
                       : statut === 'partial' ? 'partial'
                       : statut === 'info' ? 'partial'
                       : 'error';

        let dateFormatee = '';
        if (notif.date_creation) {
            const dateStr = notif.date_creation.includes('Z') ? notif.date_creation : notif.date_creation + 'Z';
            const date = new Date(dateStr);
            dateFormatee = date.toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
            });
        }

        return `
            <div class="notif-item ${cssClass}" data-notif-id="${notif.id}">
                <div class="notif-item-icon">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="notif-item-content">
                    <strong>${notif.titre}</strong>
                    <p>${notif.message}</p>
                    ${dateFormatee ? `<small>${dateFormatee}</small>` : ''}
                </div>
                <button class="notif-item-close" data-notif-id="${notif.id}" title="Marquer comme lu">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        `;
    }).join('');

    // Listeners fermeture individuelle
    list.querySelectorAll('.notif-item-close').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.notifId);
            try {
                await window.api.marquerNotificationLue(id);
            } catch (err) {
                console.error('Erreur marquage notification:', err);
            }
            window._notificationsEnAttente = (window._notificationsEnAttente || []).filter(n => n.id !== id);
            renderNotifDropdown(window._notificationsEnAttente);
            mettreAJourBadge(window._notificationsEnAttente.length);
        });
    });
}

function initNotifDropdown() {
    const btn = document.getElementById('btnNotifications');
    const dropdown = document.getElementById('notifDropdown');
    const btnToutLire = document.getElementById('btnToutMarquerLu');
    if (!btn || !dropdown) return;

    let dropdownOuvert = false;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownOuvert = !dropdownOuvert;
        dropdown.style.display = dropdownOuvert ? 'block' : 'none';
        if (dropdownOuvert) {
            renderNotifDropdown(window._notificationsEnAttente || []);
        }
    });

    document.addEventListener('click', (e) => {
        if (dropdownOuvert && !btn.closest('.notif-wrapper').contains(e.target)) {
            dropdownOuvert = false;
            dropdown.style.display = 'none';
        }
    });

    if (btnToutLire) {
        btnToutLire.addEventListener('click', async () => {
            const notifs = window._notificationsEnAttente || [];
            for (const notif of notifs) {
                try {
                    await window.api.marquerNotificationLue(notif.id);
                } catch (err) {
                    console.error('Erreur marquage:', err);
                }
            }
            window._notificationsEnAttente = [];
            renderNotifDropdown([]);
            mettreAJourBadge(0);
        });
    }
}

// Fonction modifiée pour inclure l'ID de la notification
function afficherNotificationPersistanteAvecId(notificationId, type, titre, message, dateCreation) {
    const notification = document.createElement('div');
    notification.className = `notification-persistante ${type}`;
    notification.dataset.notificationId = notificationId;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    // Formater la date si fournie
    let dateFormatee = '';
    if (dateCreation) {
        const dateStr = dateCreation.includes('Z') ? dateCreation : dateCreation + 'Z';
        const date = new Date(dateStr);
        dateFormatee = date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris'
        });
    }
    
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fa-solid ${icon}"></i>
        </div>
        <div class="notification-content">
            <h4>${titre}</h4>
            <p>${message}</p>
            ${dateFormatee ? `<small style="color: grey; font-size: 0.85em;">fait le ${dateFormatee}</small>` : ''}
        </div>
        <button class="notification-close">
            <i class="fa-solid fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // Fermer au clic et marquer comme lue
    notification.querySelector('.notification-close').addEventListener('click', async () => {
        try {
            await window.api.marquerNotificationLue(notificationId);
            notification.remove();
            console.log('✅ Notification marquée comme lue:', notificationId);
        } catch (error) {
            console.error('Erreur marquage notification:', error);
            notification.remove();
        }
    });
}

// ========== INITIALISATION ==========

async function init() {
    await initMesConges();

    // Charger le badge "demandes à valider" dès le démarrage (visible sur toutes les sections)
    await loadDemandesEnAttente();

    // Initialiser le header et year-nav selon la section active au chargement
    updateYearNavDisplay();

    // Initialiser le dropdown de notifications
    initNotifDropdown();

    // Charger les notifications non lues
    await chargerNotificationsNonLues();

    // Polling toutes les 30s pour détecter les changements depuis d'autres postes
    let _dernierNbNotifs = (window._notificationsEnAttente || []).length;
    setInterval(async () => {
        try {
            const anciennes = _dernierNbNotifs;
            const notifications = await window.api.getNotificationsNonLues(user.id);
            const nouvelles = notifications.length;
            _dernierNbNotifs = nouvelles;

            // Mettre à jour le badge et le cache
            window._notificationsEnAttente = notifications;
            mettreAJourBadge(nouvelles);

            // Afficher un toast pour chaque nouvelle notification
            if (nouvelles > anciennes) {
                const nouvellesNotifs = notifications.slice(0, nouvelles - anciennes);
                for (const notif of nouvellesNotifs) {
                    afficherNotificationPersistante('success', notif.titre, notif.message);
                }
            }

            // Rafraîchir le calendrier global si la section est active
            const calGlobal = document.getElementById('calendrier-global-section');
            if (calGlobal && calGlobal.classList.contains('active')) {
                await chargerCalendrierGlobal();
            }

            // Rafraîchir les demandes en attente (badge nav + bandeau si Mes Congés actif)
            await loadDemandesEnAttente();
        } catch (e) {
            console.error('[POLLING] Erreur:', e);
        }
    }, 30000);
}
// ========== SECTION HISTORIQUE COMPLET ==========

let toutesLesAbsences = [];
let tousSalaries = [];

// ========== SECTION HISTORIQUE - CALENDRIER ==========
let salarieHistoriqueSelectionne = null;
let absencesHistorique = [];
let joursFeriesHistorique = [];
let absenceCliquee = null;
let jourClique = null;
let evenementsHistoriqueAttaches = false;

async function chargerHistoriqueComplet() {
    try {
        // Rafraîchir la liste des demandes à valider (bandeau + badge nav)
        await loadDemandesEnAttente();

        // Charger tous les salariés
        const salaries = await window.api.getAllSalaries();
        const select = document.getElementById('selectSalarieHistorique');

        select.innerHTML = '<option value="">Sélectionnez un salarié</option>';
        salaries
            .filter(s => s.actif === 1)
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
            .forEach(sal => {
                select.innerHTML += `<option value="${sal.id}">${sal.prenom} ${sal.nom}</option>`;
            });

        // Restaurer la sélection si un salarié était déjà choisi
        if (salarieHistoriqueSelectionne) {
            select.value = salarieHistoriqueSelectionne;
        }

        // Navigation année gérée par changerAnneeAdmin() dans la topbar

        // Listener select salarié attaché une seule fois
        if (!evenementsHistoriqueAttaches) {
            evenementsHistoriqueAttaches = true;

            select.addEventListener('change', (e) => {
                salarieHistoriqueSelectionne = e.target.value ? parseInt(e.target.value) : null;
                chargerCalendrierHistorique();
            });
        }

    } catch (error) {
        console.error('Erreur chargement historique:', error);
    }
}

async function chargerCalendrierHistorique() {
    const messageDiv = document.getElementById('messageSelectionneSalarie');
    const soldesDiv = document.getElementById('soldesHistorique');
    const calendrierDiv = document.getElementById('calendrierHistorique');
    
    if (!salarieHistoriqueSelectionne) {
        messageDiv.style.display = 'block';
        soldesDiv.style.display = 'none';
        calendrierDiv.style.display = 'none';
        return;
    }
    
    messageDiv.style.display = 'none';
    
    try {
        // Charger les données
        const salarie = await window.api.getSalarie(salarieHistoriqueSelectionne);
        
        // MODIFICATION ICI : Toujours afficher les soldes de l'année en cours
        const anneeEnCours = new Date().getFullYear();
        const soldes = await window.api.getSoldes(salarieHistoriqueSelectionne, anneeEnCours);
        
        absencesHistorique = await window.api.getAbsences(salarieHistoriqueSelectionne);
        joursFeriesHistorique = await window.api.getJoursFeries(anneeHistorique);
        
        // Filtrer les absences pour l'année sélectionnée (pour le calendrier)
        absencesHistorique = absencesHistorique.filter(abs => {
            const anneeDebut = new Date(abs.date_debut).getFullYear();
            const anneeFin = new Date(abs.date_fin).getFullYear();
            return anneeDebut === anneeHistorique || anneeFin === anneeHistorique;
        });
        
        // Afficher les soldes (toujours année en cours)
        document.getElementById('nomSalarieHistorique').textContent = `${salarie.prenom} ${salarie.nom}`;

        const cpCards   = document.querySelectorAll('#soldesHistorique .solde-card.sh-cp');
        const cardCPN1  = cpCards[0];
        const cardCPN   = cpCards[1];
        const cardRTT   = document.querySelector('#soldesHistorique .solde-card.sh-rtt');
        const cardRecup = document.querySelector('#soldesHistorique .solde-card.sh-recup');

        const cpN1Val   = soldes ? soldes.cp_n1 : 0;
        const cpNVal    = soldes ? soldes.cp_n   : 0;
        const rttVal    = soldes ? soldes.rtt    : 0;
        const recupVal  = soldes ? soldes.recup_heures : 0;

        // CP N-1 (toujours avec droits)
        document.getElementById('soldeCPN1Historique').textContent = `${cpN1Val.toFixed(1)}j`;
        cardCPN1.classList.remove('sans-droit');
        cardCPN1.classList.toggle('solde-vide', cpN1Val === 0);

        // CP N (toujours avec droits)
        document.getElementById('soldeCPNHistorique').textContent = `${cpNVal.toFixed(1)}j`;
        cardCPN.classList.remove('sans-droit');
        cardCPN.classList.toggle('solde-vide', cpNVal === 0);

        // RTT
        if (salarie.a_droit_rtt) {
            document.getElementById('soldeRTTHistorique').textContent = `${rttVal.toFixed(1)}j`;
            cardRTT.classList.remove('sans-droit');
            cardRTT.classList.toggle('solde-vide', rttVal === 0);
        } else {
            document.getElementById('soldeRTTHistorique').textContent = 'N/A';
            cardRTT.classList.add('sans-droit');
            cardRTT.classList.remove('solde-vide');
        }

        // Récupération
        if (salarie.a_droit_recup) {
            document.getElementById('soldeRecupHistorique').textContent = `${recupVal.toFixed(1)}h`;
            cardRecup.classList.remove('sans-droit');
            cardRecup.classList.toggle('solde-vide', recupVal === 0);
        } else {
            document.getElementById('soldeRecupHistorique').textContent = 'N/A';
            cardRecup.classList.add('sans-droit');
            cardRecup.classList.remove('solde-vide');
        }
        
        soldesDiv.style.display = 'block';
        
        // Générer le calendrier
        genererCalendrierHistorique();
        calendrierDiv.style.display = 'grid';
        
    } catch (error) {
        console.error('Erreur chargement calendrier historique:', error);
    }
}

function genererCalendrierHistorique() {
    const calendrierDiv = document.getElementById('calendrierHistorique');
    calendrierDiv.innerHTML = '';
    
    const nomsMois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const nomsJoursCourts = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    
    for (let mois = 0; mois < 12; mois++) {
        const moisDiv = document.createElement('div');
        moisDiv.className = 'mois-historique';
        
        // Header du mois
        const headerDiv = document.createElement('div');
        headerDiv.className = 'mois-header-historique';
        headerDiv.textContent = nomsMois[mois];
        moisDiv.appendChild(headerDiv);
        
        // Jours de la semaine
        const joursSemaineDiv = document.createElement('div');
        joursSemaineDiv.className = 'jours-semaine-historique';
        nomsJoursCourts.forEach(jour => {
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour-semaine-historique';
            jourDiv.textContent = jour;
            joursSemaineDiv.appendChild(jourDiv);
        });
        moisDiv.appendChild(joursSemaineDiv);
        
        // Jours du mois
        const joursMoisDiv = document.createElement('div');
        joursMoisDiv.className = 'jours-mois-historique';
        
        const premierJour = new Date(anneeHistorique, mois, 1);
        const dernierJour = new Date(anneeHistorique, mois + 1, 0);
        const nbJours = dernierJour.getDate();
        
        let premierJourSemaine = premierJour.getDay() - 1;
        if (premierJourSemaine === -1) premierJourSemaine = 6;
        
        // Jours vides au début
        for (let i = 0; i < premierJourSemaine; i++) {
            const jourVide = document.createElement('div');
            jourVide.className = 'jour-historique vide';
            joursMoisDiv.appendChild(jourVide);
        }
        
        // Jours du mois
        for (let jour = 1; jour <= nbJours; jour++) {
            const dateISO = `${anneeHistorique}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            const date = new Date(anneeHistorique, mois, jour);
            const dayOfWeek = date.getDay();
            
            const jourDiv = document.createElement('div');
            jourDiv.className = 'jour-historique';
            jourDiv.textContent = jour;
            
            // Weekend
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                jourDiv.classList.add('weekend');
            }
            
            // Jour férié
            const ferie = joursFeriesHistorique.find(f => f.date === dateISO);
            if (ferie) {
                jourDiv.classList.add('ferie');
                jourDiv.setAttribute('data-tooltip', ferie.libelle);
            }
            
            // Absence
            const absence = absencesHistorique.find(abs => {
                return dateISO >= abs.date_debut && dateISO <= abs.date_fin;
            });
            
            if (absence && dayOfWeek !== 0 && dayOfWeek !== 6 && !ferie) {
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

                if (absence.statut === 'en_attente') {
                    jourDiv.classList.add('en-attente');
                    tooltipLabel += ' — En attente de validation';
                }

                if (tooltipLabel) {
                    const tip = absence.commentaire
                        ? `${tooltipLabel} · ${absence.commentaire}`
                        : tooltipLabel;
                    jourDiv.setAttribute('data-tooltip', tip);
                }

                // Événement clic
                jourDiv.addEventListener('click', () => {
                    ouvrirModalSuppression(absence, dateISO);
                });
            }
            
            joursMoisDiv.appendChild(jourDiv);
        }
        
        moisDiv.appendChild(joursMoisDiv);
        calendrierDiv.appendChild(moisDiv);
    }
}

// ========== MODAL AJOUT ARRÊT MALADIE ==========

document.getElementById('btnAjouterMaladie').addEventListener('click', async () => {
    if (!salarieHistoriqueSelectionne) return;
    const salarie = await window.api.getSalarie(salarieHistoriqueSelectionne);
    document.getElementById('maladieSalarieName').textContent = `${salarie.prenom} ${salarie.nom}`;
    document.getElementById('maladieDateDebut').value = '';
    document.getElementById('maladieDateFin').value = '';
    document.getElementById('maladieCommentaire').value = '';
    document.getElementById('maladieDureeInfo').textContent = '';
    document.getElementById('maladieErreur').textContent = '';
    document.getElementById('maladieErreur').classList.remove('show');
    document.getElementById('modalAjoutMaladie').style.display = 'flex';
});

// Calcul durée en temps réel
['maladieDateDebut', 'maladieDateFin'].forEach(id => {
    document.getElementById(id).addEventListener('change', async () => {
        const debut = document.getElementById('maladieDateDebut').value;
        const fin = document.getElementById('maladieDateFin').value;
        const info = document.getElementById('maladieDureeInfo');
        if (debut && fin && fin >= debut) {
            try {
                const result = await window.api.calculerDuree(debut, fin, 'matin', 'fin-journee');
                info.textContent = `Durée : ${result.dureeJours} jour(s) ouvré(s)`;
            } catch { info.textContent = ''; }
        } else {
            info.textContent = '';
        }
    });
});

// Fermer
document.getElementById('closeModalMaladie').addEventListener('click', () => {
    document.getElementById('modalAjoutMaladie').style.display = 'none';
});
document.getElementById('btnAnnulerMaladie').addEventListener('click', () => {
    document.getElementById('modalAjoutMaladie').style.display = 'none';
});

// Enregistrer
document.getElementById('btnConfirmerMaladie').addEventListener('click', async () => {
    const debut = document.getElementById('maladieDateDebut').value;
    const fin = document.getElementById('maladieDateFin').value;
    const commentaire = document.getElementById('maladieCommentaire').value;
    const erreur = document.getElementById('maladieErreur');

    if (!debut || !fin) {
        erreur.textContent = 'Veuillez renseigner les dates';
        erreur.classList.add('show');
        return;
    }
    if (fin < debut) {
        erreur.textContent = 'La date de fin doit être postérieure au début';
        erreur.classList.add('show');
        return;
    }

    try {
        const duree = await window.api.calculerDuree(debut, fin, 'matin', 'fin-journee');

        await window.api.createAbsence({
            salarie_id: salarieHistoriqueSelectionne,
            type: 'MALADIE',
            date_debut: debut,
            date_fin: fin,
            duree_jours: duree.dureeJours,
            duree_heures: duree.dureeJours * 7,
            commentaire: commentaire || null,
            debut_periode: 'matin',
            fin_periode: 'fin-journee',
            autoValide: true,
            skipNotification: true
        });

        document.getElementById('modalAjoutMaladie').style.display = 'none';
        await chargerCalendrierHistorique();

    } catch (error) {
        console.error('Erreur ajout maladie:', error);
        erreur.textContent = 'Erreur lors de l\'enregistrement';
        erreur.classList.add('show');
    }
});

// ========== MODAL SUPPRESSION ==========

function ouvrirModalSuppression(absence, dateISO) {
    absenceCliquee = absence;
    jourClique = dateISO;
    
    const modal = document.getElementById('modalSuppressionAbsence');
    const infoDiv = document.getElementById('infoAbsenceSuppression');
    
    const dateDebut = new Date(absence.date_debut).toLocaleDateString('fr-FR');
    const dateFin = new Date(absence.date_fin).toLocaleDateString('fr-FR');
    const dateCliquee = new Date(dateISO).toLocaleDateString('fr-FR');
    const duree = absence.duree_jours ? `${absence.duree_jours.toFixed(1)} jour(s)` : `${absence.duree_heures.toFixed(1)} heure(s)`;
    
    const typeLabels = {
        'CP_N': 'CP N',
        'CP_N1': 'CP N-1',
        'RTT': 'RTT',
        'RECUP': 'Récupération',
        'MALADIE': 'Arrêt maladie'
    };
    
    infoDiv.innerHTML = `
        <p><strong>Type :</strong> ${typeLabels[absence.type]}</p>
        <p><strong>Période :</strong> ${dateDebut} → ${dateFin}</p>
        <p><strong>Durée :</strong> ${duree}</p>
        ${absence.commentaire ? `<p><strong>Commentaire :</strong> ${absence.commentaire}</p>` : ''}
    `;
    
    document.getElementById('jourSelectionne').textContent = dateCliquee;
    
    // Afficher/masquer l'option "jour seul"
    const optionJour = document.querySelector('input[value="jour"]').parentElement;
    if (absence.date_debut === absence.date_fin) {
        // Absence d'un seul jour : cacher l'option
        optionJour.style.display = 'none';
        document.querySelector('input[value="complete"]').checked = true;
    } else {
        optionJour.style.display = 'flex';
    }
    
    modal.style.display = 'flex';
}

// Fermer la modal
document.getElementById('closeModalSuppression').addEventListener('click', () => {
    document.getElementById('modalSuppressionAbsence').style.display = 'none';
});

document.getElementById('btnAnnulerSuppression').addEventListener('click', () => {
    document.getElementById('modalSuppressionAbsence').style.display = 'none';
});

// Confirmer la suppression
document.getElementById('btnConfirmerSuppression').addEventListener('click', async () => {
    const typeSuppression = document.querySelector('input[name="typeSuppression"]:checked').value;
    
    try {
        if (typeSuppression === 'complete') {
            // Supprimer toute l'absence
            await window.api.deleteAbsence(absenceCliquee.id);
            alert('✅ Absence supprimée avec succès !\nLes soldes ont été recalculés.');
        } else {
            // Supprimer uniquement le jour cliqué
            await supprimerUnJour(absenceCliquee, jourClique);
        }
        
        // Fermer la modal et recharger
        document.getElementById('modalSuppressionAbsence').style.display = 'none';
        await chargerCalendrierHistorique();
        
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('❌ Erreur lors de la suppression : ' + error.message);
    }
});

// Fonction pour supprimer un seul jour
async function supprimerUnJour(absence, dateISO) {
    const dateDebut = new Date(absence.date_debut);
    const dateFin = new Date(absence.date_fin);
    const dateASupprimer = new Date(dateISO);
    const anneeEnCours = new Date().getFullYear();

    // Stratégie : deleteAbsence recrédite le solde complet, puis on recrée
    // la/les partie(s) restante(s) et on redéduit leur durée.

    // Cas 1 : Supprimer le premier jour
    if (dateISO === absence.date_debut) {
        const nouvelleDateDebut = new Date(dateASupprimer);
        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + 1);

        const nouvelleDureeJours  = absence.duree_jours  - 1;
        const nouvelleDureeHeures = absence.duree_heures - 7;

        await window.api.deleteAbsence(absence.id);
        await window.api.createAbsence({
            salarie_id:   absence.salarie_id,
            type:         absence.type,
            date_debut:   formatDateISO(nouvelleDateDebut),
            date_fin:     absence.date_fin,
            duree_jours:  nouvelleDureeJours,
            duree_heures: nouvelleDureeHeures,
            commentaire:  absence.commentaire,
            autoValide:   true,
            skipNotification: true
        });
        await window.api.updateSoldesAfterAbsence(
            absence.salarie_id, anneeEnCours, absence.type,
            nouvelleDureeJours, nouvelleDureeHeures
        );

        alert('✅ Premier jour supprimé !\nLes soldes ont été recalculés.');
        return;
    }

    // Cas 2 : Supprimer le dernier jour
    if (dateISO === absence.date_fin) {
        const nouvelleDateFin = new Date(dateASupprimer);
        nouvelleDateFin.setDate(nouvelleDateFin.getDate() - 1);

        const nouvelleDureeJours  = absence.duree_jours  - 1;
        const nouvelleDureeHeures = absence.duree_heures - 7;

        await window.api.deleteAbsence(absence.id);
        await window.api.createAbsence({
            salarie_id:   absence.salarie_id,
            type:         absence.type,
            date_debut:   absence.date_debut,
            date_fin:     formatDateISO(nouvelleDateFin),
            duree_jours:  nouvelleDureeJours,
            duree_heures: nouvelleDureeHeures,
            commentaire:  absence.commentaire,
            autoValide:   true,
            skipNotification: true
        });
        await window.api.updateSoldesAfterAbsence(
            absence.salarie_id, anneeEnCours, absence.type,
            nouvelleDureeJours, nouvelleDureeHeures
        );

        alert('✅ Dernier jour supprimé !\nLes soldes ont été recalculés.');
        return;
    }

    // Cas 3 : Supprimer un jour au milieu (couper en 2)
    const jourAvant = new Date(dateASupprimer);
    jourAvant.setDate(jourAvant.getDate() - 1);

    const jourApres = new Date(dateASupprimer);
    jourApres.setDate(jourApres.getDate() + 1);

    // joursPartie1 calculé par différence calendaire (approximation acceptable)
    // joursPartie2 déduit de la durée originale pour rester cohérent (évite le bug jours calendaires)
    const joursPartie1 = Math.ceil((jourAvant - dateDebut) / (1000 * 60 * 60 * 24)) + 1;
    const joursPartie2 = absence.duree_jours - joursPartie1 - 1;

    await window.api.deleteAbsence(absence.id);

    // Partie 1
    await window.api.createAbsence({
        salarie_id:   absence.salarie_id,
        type:         absence.type,
        date_debut:   absence.date_debut,
        date_fin:     formatDateISO(jourAvant),
        duree_jours:  joursPartie1,
        duree_heures: joursPartie1 * 7,
        commentaire:  absence.commentaire,
        autoValide:   true,
        skipNotification: true
    });
    await window.api.updateSoldesAfterAbsence(
        absence.salarie_id, anneeEnCours, absence.type, joursPartie1, joursPartie1 * 7
    );

    // Partie 2
    await window.api.createAbsence({
        salarie_id:   absence.salarie_id,
        type:         absence.type,
        date_debut:   formatDateISO(jourApres),
        date_fin:     absence.date_fin,
        duree_jours:  joursPartie2,
        duree_heures: joursPartie2 * 7,
        commentaire:  absence.commentaire,
        autoValide:   true,
        skipNotification: true
    });
    await window.api.updateSoldesAfterAbsence(
        absence.salarie_id, anneeEnCours, absence.type, joursPartie2, joursPartie2 * 7
    );

    alert('✅ Jour supprimé !\nL\'absence a été coupée en 2 périodes.\nLes soldes ont été recalculés.');
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
init();

// ========== SOUMISSION DU FORMULAIRE ADMIN "MES CONGÉS" ==========

const formAbsenceUser = document.getElementById('formAbsenceUser');

if (formAbsenceUser) {
    formAbsenceUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const errorMsg = document.getElementById('errorMessageUser');
        const successMsg = document.getElementById('successMessageUser');
        
        errorMsg.textContent = '';
        errorMsg.classList.remove('show');
        successMsg.textContent = '';
        successMsg.classList.remove('show');
        
        const typeAbsence = document.getElementById('typeAbsenceUser').value;
        const dateDebut = document.getElementById('dateDebutUser').value;
        const dateFin = document.getElementById('dateFinUser').value;
        const debutPeriode = document.getElementById('debutApremUser').checked ? 'apres-midi' : 'matin';
        const finPeriode = document.getElementById('finMidiUser').checked ? 'midi' : 'fin-journee';
        const commentaire = document.getElementById('commentaireUser').value;
        const recupType = document.getElementById('recupTypeUser')?.value;
        const recupHeures = document.getElementById('recupHeuresUser')?.value;
        
        if (!typeAbsence || !dateDebut || !dateFin) {
            errorMsg.textContent = 'Veuillez remplir tous les champs obligatoires';
            errorMsg.classList.add('show');
            return;
        }
        
        try {
            // Calculer la durée
            let dureeJours = 0;
            let dureeHeures = 0;
            
            if (typeAbsence === 'RECUP' && recupType === 'heures') {
                dureeHeures = parseFloat(recupHeures);
                dureeJours = dureeHeures / 7;
            } else {
                const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
                dureeJours = result.dureeJours;
                dureeHeures = dureeJours * 7;
            }

            // Mapper le type CP vers CP_N (la base n'accepte que CP_N ou CP_N1)
            let typeAbsenceFinal = typeAbsence;
            if (typeAbsence === 'CP') {
                typeAbsenceFinal = 'CP_N';
            }

            // Préparer les données
            const absenceData = {
                salarie_id: user.id,
                type: typeAbsenceFinal,
                date_debut: dateDebut,
                date_fin: dateFin,
                duree_jours: dureeJours,
                duree_heures: dureeHeures,
                commentaire: commentaire || null,
                debut_periode: debutPeriode,
                fin_periode: finPeriode,
                autoValide: true,
                skipNotification: true
            };

            // Créer l'absence
            const result = await window.api.createAbsence(absenceData);
            
            if (result.success) {
                // Mettre à jour les soldes
                if (typeAbsence !== 'MALADIE') {
                    await window.api.updateSoldesAfterAbsence(
                        user.id, 
                        anneeActuelle, 
                        typeAbsenceFinal, 
                        dureeJours, 
                        dureeHeures
                    );
                }
                
                // Récupérer les infos complètes du salarié pour le PDF
                const salarieInfo = await window.api.getSalarie(user.id);

                // Récupérer les soldes mis à jour
                const soldesApres = await window.api.getSoldes(user.id, anneeActuelle);

                // Générer le PDF avec la structure attendue par main.js
                const pdfData = {
                    salarie: {
                        nom: salarieInfo.nom,
                        prenom: salarieInfo.prenom,
                        role: 'admin'
                    },
                    absence: {
                        type: typeAbsenceFinal,
                        date_debut: dateDebut,
                        date_fin: dateFin,
                        duree_jours: dureeJours,
                        duree_heures: dureeHeures,
                        commentaire: commentaire || ''
                    },
                    soldes: {
                        cp_n1: soldesApres.cp_n1,
                        cp_n: soldesApres.cp_n,
                        rtt: soldesApres.rtt,
                        recup_heures: soldesApres.recup_heures
                    }
                };

await window.api.genererPDF(pdfData);
                
                // Afficher succès
                successMsg.textContent = '✅ Absence enregistrée avec succès ! Le PDF a été généré.';
                successMsg.classList.add('show');
                setTimeout(() => { successMsg.classList.remove('show'); }, 3000);

                // Réinitialiser le formulaire
                formAbsenceUser.reset();
                document.getElementById('resumeAbsenceUser').style.display = 'none';
                document.getElementById('recupFieldsUser').style.display = 'none';
                
                // Rafraîchir les données
                await loadSoldesAdmin();
                await chargerCalendrierUser();
                await afficherHistoriqueAdmin();
                
                // Enlever le surlignage
                document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));
                
            } else {
                throw new Error('Erreur lors de la création');
            }

        } catch (error) {
            console.error('Erreur:', error);
            errorMsg.textContent = 'Erreur lors de l\'enregistrement de l\'absence';
            errorMsg.classList.add('show');
        }
    });
}

// ========== MODAL HEURES SUPPLÉMENTAIRES (ADMIN) ==========

function initModalHeuresSupAdmin() {
    const modal = document.getElementById('modalHeuresSupAdmin');
    if (!modal) return;

    document.getElementById('heuresSupDateAdmin').value = new Date().toISOString().split('T')[0];

    document.getElementById('btnAjouterHeuresSup').addEventListener('click', () => {
        document.getElementById('heuresSupMsgAdmin').style.display = 'none';
        modal.style.display = 'flex';
    });

    document.getElementById('closeModalHeuresSupAdmin').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnAnnulerHeuresSupAdmin').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnEnregistrerHeuresSupAdmin').addEventListener('click', async () => {
        const heures = parseFloat(document.getElementById('heuresSupNbAdmin').value);
        const date = document.getElementById('heuresSupDateAdmin').value;
        const commentaire = document.getElementById('heuresSupCommentaireAdmin').value.trim();
        const msg = document.getElementById('heuresSupMsgAdmin');

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

            await loadSoldesAdmin();

            setTimeout(() => {
                modal.style.display = 'none';
                document.getElementById('heuresSupNbAdmin').value = '';
                document.getElementById('heuresSupCommentaireAdmin').value = '';
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

// ========== TEST TOASTS MULTIPLES — décommenter pour tester ("reactive le test des notifs") ==========
// setTimeout(() => {
//     afficherNotificationPersistante('success', 'Absence posée — Marie Martin', 'RTT · du 10/03 au 10/03 (1j) · Solde restant : 4j');
//     setTimeout(() => afficherNotificationPersistante('success', 'Absence posée — Paul Lemaire', 'CP · du 15/03 au 19/03 (5j) · Solde restant : 8j'), 800);
//     setTimeout(() => afficherNotificationPersistante('error', 'Absence posée — Sophie Bernard', 'MALADIE · du 12/03 au 14/03 (3j)'), 1600);
// }, 3000);
// ========== FIN TEST ==========

initModalHeuresSupAdmin();

// ========== SECTION PARAMETRES ==========

async function chargerParametres() {
    try {
        const config = await window.api.getConfigApp();
        document.getElementById('tauxCpNormal').value = config.taux_cp_normal || '2.08333';
        document.getElementById('tauxCpArret').value = config.taux_cp_arret || '1.66333';
    } catch (error) {
        console.error('Erreur chargement paramètres:', error);
    }
}

document.getElementById('btnSaveParamTaux')?.addEventListener('click', async () => {
    const tauxNormal = document.getElementById('tauxCpNormal').value;
    const tauxArret = document.getElementById('tauxCpArret').value;
    const msg = document.getElementById('paramTauxMsg');

    try {
        await window.api.updateConfigApp('taux_cp_normal', tauxNormal);
        await window.api.updateConfigApp('taux_cp_arret', tauxArret);
        msg.textContent = 'Paramètres enregistrés !';
        msg.className = 'param-msg success';
        setTimeout(() => { msg.textContent = ''; msg.className = 'param-msg'; }, 3000);
    } catch (error) {
        console.error('Erreur sauvegarde paramètres:', error);
        msg.textContent = 'Erreur lors de la sauvegarde';
        msg.className = 'param-msg error';
    }
});