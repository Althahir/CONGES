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
                    <div class="salarie-actions">
                        <button class="btn-action btn-edit" onclick="editSalarie(${salarie.id})" title="Modifier">
                            <i class="fa-solid fa-edit"></i>
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
        
        // Récupérer tous les salariés et toutes les absences
        const salaries = await window.api.getAllSalaries();
        const toutesAbsences = await window.api.getAllAbsences();
        const joursFeries = await window.api.getJoursFeries(anneeCalendrier);
        
        // Filtrer les absences pour l'année sélectionnée
        const absencesAnnee = toutesAbsences.filter(abs => {
            const annee = new Date(abs.date_debut).getFullYear();
            return annee === anneeCalendrier;
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
        'rgb(0, 108, 137)',    // 1. Bleu
        'rgb(116, 43, 135)',   // 2. Mauve
        'rgb(181, 22, 63)',    // 3. Rouge
        'rgb(237, 113, 17)',   // 4. Orange
        'rgb(249, 198, 73)',   // 5. Jaune
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
                    
                    // Trouver tous les absents ce jour
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
                    
                    tableHTML += `<td class="${cellClass}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>`;
                    
                    if (absentsJour.length > 8) {
                        // Plus de 8 absents : afficher "8+"
                        const lettresJours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                        let jourSemaineIndex = dayOfWeek - 1;
                        if (jourSemaineIndex === -1) jourSemaineIndex = 6;
                        const lettreJour = lettresJours[jourSemaineIndex];
                        tableHTML += `<div class="jour-cell"><span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span><span class="surcharge">8+</span></div>`;
                    } else {
                        // Calculer la lettre du jour de la semaine (format français : L-D)
                        const lettresJours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                        let jourSemaineIndex = dayOfWeek - 1;
                        if (jourSemaineIndex === -1) jourSemaineIndex = 6;
                        const lettreJour = lettresJours[jourSemaineIndex];
                        const jourCellClass = estFerie ? 'jour-cell jour-ferie-cell' : 'jour-cell';
                        tableHTML += `<div class="${jourCellClass}">`;
                        tableHTML += `<span class="jour-numero">${lettreJour} ${String(jour).padStart(2, '0')}</span>`;
                        tableHTML += '<div class="indicateurs-wrapper">';
    
                        // Créer un tableau de 8 indicateurs
                        const indicateurs = new Array(8).fill(null);

                        // Remplir les indicateurs selon les absents
                        absentsJour.forEach(abs => {
                            const position = positionsSalaries[abs.salarie_id];
                            if (position !== undefined && position < 8) {
                                indicateurs[position] = couleursSalaries[abs.salarie_id];
                            }
                        });
    
                         // Afficher les 8 indicateurs
                        indicateurs.forEach(couleur => {
                        if (couleur) {
                            tableHTML += `<div class="indicateur-colonne actif" style="background: ${couleur};"></div>`;
                        } else {
                            tableHTML += '<div class="indicateur-colonne"></div>';
                        }
                    });
                        
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
    modal.style.display = 'flex';
});

// Fermer la modale
document.getElementById('closeModal').addEventListener('click', () => {
    modal.style.display = 'none';
});

document.getElementById('cancelModal').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Clic en dehors de la modale pour fermer
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Soumission du formulaire
formSalarie.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const errorMsg = document.getElementById('errorModalMessage');
    const successMsg = document.getElementById('successModalMessage');
    
    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');
    
    const salarieData = {
        nom: document.getElementById('nom').value.trim(),
        prenom: document.getElementById('prenom').value.trim(),
        email: document.getElementById('email').value.trim(),
        date_embauche: document.getElementById('date_embauche').value,
        type_contrat: document.getElementById('type_contrat').value,
        cp_mensuel: parseFloat(document.getElementById('cp_mensuel').value),
        a_droit_rtt: document.getElementById('a_droit_rtt').checked ? 1 : 0,
        a_droit_recup: document.getElementById('a_droit_recup').checked ? 1 : 0
    };
    
    try {
        if (editingSalarieId) {
            // Modification
            await window.api.updateSalarie(editingSalarieId, salarieData);
            successMsg.textContent = 'Salarié modifié avec succès !';
        } else {
            // Création
            await window.api.createSalarie(salarieData);
            successMsg.textContent = 'Salarié créé avec succès !';
        }
        
        successMsg.classList.add('show');
        
        // Recharger la liste
        await chargerSalaries();
        
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
        document.getElementById('cp_mensuel').value = salarie.cp_mensuel;
        document.getElementById('a_droit_rtt').checked = salarie.a_droit_rtt === 1;
        document.getElementById('a_droit_recup').checked = salarie.a_droit_recup === 1;
        
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