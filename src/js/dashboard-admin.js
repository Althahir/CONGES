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

        // Basculer le header selon la section
        const headerDefault = document.getElementById('headerAdminDefault');
        const headerMesConges = document.getElementById('headerAdminMesConges');

        if (sectionName === 'mes-conges') {
            headerDefault.style.display = 'none';
            headerMesConges.style.display = 'flex';
        } else {
            headerDefault.style.display = 'block';
            headerMesConges.style.display = 'none';
        }
        
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
    genererOptionsJours();
    await chargerConfigTraitements();
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
// Variable pour savoir si les événements sont déjà attachés
let evenementsAnneesAttaches = false;

async function initMesConges() {
    await loadSoldesAdmin();
    await initFormAbsenceAdmin();
    await chargerCalendrierUser();
    await afficherHistoriqueAdmin();
    
    // Navigation année pour "Mes congés" - N'attacher qu'une seule fois !
    if (!evenementsAnneesAttaches) {
        const anneeDisplay = document.getElementById('anneeAdmin');
        const btnPrev = document.getElementById('btnPrevYearAdmin');
        const btnNext = document.getElementById('btnNextYearAdmin');
        
        if (anneeDisplay) {
            anneeDisplay.textContent = anneeActuelle;
        }
        
        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                anneeActuelle--;
                anneeDisplay.textContent = anneeActuelle;
                chargerCalendrierUser();
            });
        }
        
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                anneeActuelle++;
                anneeDisplay.textContent = anneeActuelle;
                chargerCalendrierUser();
            });
        }
        
        evenementsAnneesAttaches = true;
    }
}

// Charger les soldes de l'admin
async function loadSoldesAdmin() {
    try {
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        const salarie = await window.api.getSalarie(user.id);
        
        if (soldes) {
            document.getElementById('solde-cp-n1-user').textContent = soldes.cp_n1.toFixed(2) + 'j';
            document.getElementById('solde-cp-n-user').textContent = soldes.cp_n.toFixed(2) + 'j';
            
            // RTT
            const tuileRTT = document.querySelector('#mes-conges-section .solde-card-compact.rtt');
            if (salarie.a_droit_rtt === 1) {
                document.getElementById('solde-rtt-user').textContent = soldes.rtt.toFixed(2) + 'j';
                if (tuileRTT) tuileRTT.style.opacity = '1';
            } else {
                document.getElementById('solde-rtt-user').textContent = 'N/A';
                if (tuileRTT) {
                    tuileRTT.style.opacity = '0.4';
                    tuileRTT.style.cursor = 'not-allowed';
                }
            }
            
            // Récup
            const tuileRecup = document.querySelector('#mes-conges-section .solde-card-compact.recup');
            if (salarie.a_droit_recup === 1) {
                const recupJours = Math.floor(soldes.recup_heures / 7);
                const recupHeuresRestantes = (soldes.recup_heures % 7).toFixed(1);
                document.getElementById('solde-recup-user').innerHTML = 
                    `${soldes.recup_heures.toFixed(1)}h<p>(${recupJours}j ${recupHeuresRestantes}h)</p>`;
                if (tuileRecup) tuileRecup.style.opacity = '1';
            } else {
                document.getElementById('solde-recup-user').textContent = 'N/A';
                if (tuileRecup) {
                    tuileRecup.style.opacity = '0.4';
                    tuileRecup.style.cursor = 'not-allowed';
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
    
    // ========== ÉVÉNEMENTS DU FORMULAIRE ==========
    
    const typeSelect = document.getElementById('typeAbsenceUser');
    const recupFields = document.getElementById('recupFieldsUser');
    const recupTypeSelect = document.getElementById('recupTypeUser');
    const recupHeuresGroup = document.getElementById('recupHeuresGroupUser');
    const dateDebut = document.getElementById('dateDebutUser');
    const dateFin = document.getElementById('dateFinUser');
    const periodeType = document.getElementById('periodeTypeUser');
    const recupHeures = document.getElementById('recupHeuresUser');
    
    // Afficher/masquer champs Récup
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            if (recupFields) {
                recupFields.style.display = e.target.value === 'RECUP' ? 'block' : 'none';
            }
            calculerDureeAbsenceAdmin();
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
        });
    }
    
    // Calcul automatique sur changement de dates
    if (dateDebut) {
        dateDebut.addEventListener('change', () => {
            calculerDureeAbsenceAdmin();
            if (dateFin.value) {
                surlignerJoursPrevisualisation(dateDebut.value, dateFin.value);
            }
        });
    }
    
    if (dateFin) {
        dateFin.addEventListener('change', () => {
            calculerDureeAbsenceAdmin();
            if (dateDebut.value) {
                surlignerJoursPrevisualisation(dateDebut.value, dateFin.value);
            }
        });
    }
    
    if (periodeType) {
        periodeType.addEventListener('change', calculerDureeAbsenceAdmin);
    }
    
    if (recupHeures) {
        recupHeures.addEventListener('input', calculerDureeAbsenceAdmin);
    }
}

// ========== CALCUL ET VALIDATION DES ABSENCES (ADMIN) ==========

// Fonction pour calculer la durée automatiquement
async function calculerDureeAbsenceAdmin() {
    const typeAbsence = document.getElementById('typeAbsenceUser').value;
    const dateDebut = document.getElementById('dateDebutUser').value;
    const dateFin = document.getElementById('dateFinUser').value;
    const periodeType = document.getElementById('periodeTypeUser').value;
    const recupType = document.getElementById('recupTypeUser')?.value;
    const recupHeures = document.getElementById('recupHeuresUser')?.value;
    
    const resumeDiv = document.getElementById('resumeAbsenceUser');
    const resumeDuree = document.getElementById('resumeDureeUser');
    const resumeDecompte = document.getElementById('resumeDecompteUser');
    const alerteSolde = document.getElementById('alerteSoldeUser');
    const alertePeriode = document.getElementById('alertePeriodeUser');
    
    // Réinitialiser les alertes
    alerteSolde.textContent = '';
    alertePeriode.textContent = '';
    
    if (!dateDebut || !dateFin) {
        resumeDiv.style.display = 'none';
        return;
    }
    
    // Vérifier si la période est dans le passé
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const debut = new Date(dateDebut);
    
    if (debut < aujourdhui) {
        alertePeriode.textContent = '⚠️ La période commence dans le passé';
    }
    
    if (!typeAbsence) {
        resumeDiv.style.display = 'block';
        try {
            const result = await window.api.calculerDuree(dateDebut, dateFin, periodeType);
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
            const result = await window.api.calculerDuree(dateDebut, dateFin, periodeType);
            dureeJours = result.dureeJours;
            dureeHeures = dureeJours * 7;
        }
        
        // Récupérer les soldes actuels
        const soldes = await window.api.getSoldes(user.id, anneeActuelle);
        
        // Afficher la durée
        resumeDuree.textContent = typeAbsence === 'RECUP' && recupType === 'heures' 
            ? `${dureeHeures.toFixed(1)} heure(s)` 
            : `${dureeJours.toFixed(2)} jour(s)`;
        
        // Calculer et afficher le décompte selon le type
        let decompteText = '';
        let soldeNegatif = false;
        
        if (typeAbsence === 'CP') {
            const cpN1Utilise = Math.min(dureeJours, soldes.cp_n1);
            const cpNUtilise = Math.max(0, dureeJours - soldes.cp_n1);
            const nouveauCPN1 = soldes.cp_n1 - cpN1Utilise;
            const nouveauCPN = soldes.cp_n - cpNUtilise;
            
            if (cpN1Utilise > 0) {
                decompteText = `CP N-1: ${cpN1Utilise.toFixed(2)}j`;
                if (cpNUtilise > 0) {
                    decompteText += ` + CP N: ${cpNUtilise.toFixed(2)}j`;
                }
            } else {
                decompteText = `CP N: ${dureeJours.toFixed(2)}j`;
            }
            
            decompteText += ` (reste: ${nouveauCPN1.toFixed(2)}j N-1 + ${nouveauCPN.toFixed(2)}j N)`;
            
            if (nouveauCPN < 0) {
                soldeNegatif = true;
            }
            
        } else if (typeAbsence === 'RTT') {
            const nouveauRTT = soldes.rtt - dureeJours;
            decompteText = `RTT: ${dureeJours.toFixed(2)}j (reste: ${nouveauRTT.toFixed(2)}j)`;
            if (nouveauRTT < 0) {
                soldeNegatif = true;
            }
            
        } else if (typeAbsence === 'RECUP') {
            const nouvelleRecup = soldes.recup_heures - dureeHeures;
            decompteText = `Récup: ${dureeHeures.toFixed(1)}h (reste: ${nouvelleRecup.toFixed(1)}h)`;
            if (nouvelleRecup < 0) {
                soldeNegatif = true;
            }
            
        } else if (typeAbsence === 'MALADIE') {
            decompteText = 'Arrêt maladie (pas de décompte)';
        }
        
        resumeDecompte.textContent = decompteText;
        
        // Alerte si solde négatif
        if (soldeNegatif) {
            alerteSolde.textContent = '⚠️ Cette absence mettra votre solde en négatif';
        }
        
        // Vérifier les chevauchements
        const absences = await window.api.getAbsences(user.id);
        const chevauchement = absences.some(abs => {
            return (dateDebut >= abs.date_debut && dateDebut <= abs.date_fin) ||
                   (dateFin >= abs.date_debut && dateFin <= abs.date_fin) ||
                   (dateDebut <= abs.date_debut && dateFin >= abs.date_fin);
        });
        
        if (chevauchement) {
            alertePeriode.textContent = '⚠️ Cette période chevauche une absence existante';
        }
        
        resumeDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur calcul:', error);
    }
}

// Fonction de surlignage des jours (copie de dashboard-user.js)
function surlignerJoursPrevisualisation(dateDebut, dateFin) {
    // Enlever tous les surlignages précédents
    document.querySelectorAll('.jour.preview').forEach(j => j.classList.remove('preview'));
    
    if (!dateDebut || !dateFin) return;
    
    // Parser les dates manuellement en ISO
    const [anneeDebut, moisDebut, jourDebut] = dateDebut.split('-').map(Number);
    const [anneeFin, moisFin, jourFin] = dateFin.split('-').map(Number);
    
    // Parcourir chaque jour du calendrier
    document.querySelectorAll('#calendrierAnnuelUser .jour').forEach(jourDiv => {
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
        
        if (historique.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Aucun traitement effectué</td></tr>';
            document.getElementById('cpDernierTraitement').textContent = 'Jamais effectué';
            document.getElementById('rttDernierTraitement').textContent = 'Jamais effectué';
            return;
        }
        
        // Afficher l'historique dans le tableau
        tbody.innerHTML = historique.map(h => {
            // Ajouter 'Z' pour forcer l'interprétation en UTC si pas déjà présent
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
            const statutClass = `statut-${h.statut}`;
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
                    <td><span class="statut-badge ${statutClass}">${statutLabel}</span></td>
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

// Fonction pour afficher une notification persistante
function afficherNotificationPersistante(type, titre, message) {
    afficherNotificationPersistanteAvecId(null, type, titre, message);
}

// TEST NOTIFICATION
// setTimeout(() => {
//     afficherNotificationPersistante(
//         'error',
//         '✅ Traitement CP Annuel effectué',
//         '8 salarié(s) traité(s) avec succès'
//     );
// }, 2000);
// ========== MODE TEST (Ctrl+Shift+T) ==========

// ========== CODE SECRET POUR OUVRIR LA MODALE TEST ==========
// Séquence : Ctrl + DEBUG

let sequence = [];
const secretCode = ['d', 'e', 'b', 'u', 'g'];
let sequenceTimeout;

document.addEventListener('keydown', (e) => {
    // Détecter Ctrl + une lettre
    if (e.ctrlKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();
        
        // Ajouter la lettre à la séquence
        sequence.push(letter);
        
        // Garder seulement les 4 dernières touches
        if (sequence.length > 5) {
            sequence.shift();
        }
        
        // Vérifier si la séquence correspond
        if (sequence.join('') === secretCode.join('')) {
            e.preventDefault();
            document.getElementById('modalTest').style.display = 'flex';
            sequence = []; // Réinitialiser
            clearTimeout(sequenceTimeout);
        }
        
        // Réinitialiser la séquence après 2 secondes d'inactivité
        clearTimeout(sequenceTimeout);
        sequenceTimeout = setTimeout(() => {
            sequence = [];
        }, 2000);
    }
});

// Fermer la modale de test
document.getElementById('closeModalTest').addEventListener('click', () => {
    document.getElementById('modalTest').style.display = 'none';
});

// Clic en dehors pour fermer
document.getElementById('modalTest').addEventListener('click', (e) => {
    if (e.target.id === 'modalTest') {
        document.getElementById('modalTest').style.display = 'none';
    }
});

// Tester traitement CP
document.getElementById('btnTestCP').addEventListener('click', async () => {
    const annee = parseInt(document.getElementById('anneeTest').value);
    
    
    const btn = document.getElementById('btnTestCP');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Test en cours...';
    
    try {

        const result = await window.api.executerTraitementCP(annee);
        
        afficherResultatTest(
            `✅ Test traitement CP ${annee}`,
            result.details.map(d => ({
                titre: d.nom,
                details: `CP transférés: ${d.cp_transferes}j → CP N-1: ${d.nouveau_cp_n1}j | Nouveaux CP N: ${d.nouveaux_cp_n}j`
            }))
        );
        
        // Recharger l'historique
        await chargerHistoriqueTraitements();
        
    } catch (error) {
        console.error('Erreur test CP:', error);
        alert('❌ Erreur lors du test : ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-flask"></i> Tester traitement CP';
    }
});

// Tester traitement RTT
document.getElementById('btnTestRTT').addEventListener('click', async () => {
    const annee = parseInt(document.getElementById('anneeTest').value);
    
    const btn = document.getElementById('btnTestRTT');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Test en cours...';
    
    try {
        
        
        const result = await window.api.executerTraitementRTT(annee);
        
        afficherResultatTest(
            `✅ Test traitement RTT ${annee}`,
            result.details.map(d => ({
                titre: d.nom,
                details: `RTT ajoutés: ${d.rtt_ajoutes}j → Nouveau solde: ${d.nouveau_solde}j`
            }))
        );
        
        // Recharger l'historique
        await chargerHistoriqueTraitements();
        
    } catch (error) {
        console.error('Erreur test RTT:', error);
        alert('❌ Erreur lors du test : ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-flask"></i> Tester traitement RTT';
    }
});

function afficherResultatTest(titre, details) {
    const resultatDiv = document.getElementById('resultatTest');
    const titreDiv = document.getElementById('resultatTestTitre');
    const detailsDiv = document.getElementById('resultatTestDetails');
    
    titreDiv.textContent = titre;
    
    detailsDiv.innerHTML = details.map(item => `
        <div class="resultat-test-item">
            <strong>${item.titre}</strong>
            <small>${item.details}</small>
        </div>
    `).join('');
    
    resultatDiv.style.display = 'block';
}
// ========== CODE SECRET POUR IMPORT EXCEL ==========
// Séquence : Ctrl+I, Ctrl+M, Ctrl+P, Ctrl+O, Ctrl+R, Ctrl+T

let sequenceImport = [];
const secretCodeImport = ['l', 'o', 'a', 'd'];
let sequenceTimeoutImport;

document.addEventListener('keydown', (e) => {
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

// Clic en dehors pour fermer
document.getElementById('modalImport').addEventListener('click', (e) => {
    if (e.target.id === 'modalImport') {
        document.getElementById('modalImport').style.display = 'none';
        resetImportModal();
    }
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
                        nbErreursLignes++;
                        erreurs.push(`❌ ${nomComplet} (${absence.date_debut} - ${absence.date_fin}) : ${error.message}`);
                    }
                }
                
                details.push(`✅ ${nomComplet} : ${absences.length} absence(s) créée(s)`);
                
            } catch (error) {
                nbErreursPersonne++;
                erreurs.push(`❌ ${nomComplet} : ${error.message}`);
            }
        }
        
        // Afficher le résultat
        let resultHTML = '';
        
        if (nbErreursPersonne === 0 && nbErreursLignes === 0) {
            resultHTML += `
                <div class="import-success">
                    <h4>✅ Import réussi !</h4>
                    <p><strong>${nbAbsencesCreees}</strong> absence(s) créée(s) pour <strong>${Object.keys(parPersonne).length}</strong> personne(s)</p>
                </div>
            `;
        } else {
            resultHTML += `
                <div class="import-error">
                    <h4>⚠️ Import terminé avec des erreurs</h4>
                    <p><strong>${nbAbsencesCreees}</strong> absence(s) créée(s)</p>
                    <p><strong>${nbErreursPersonne}</strong> personne(s) non trouvée(s)</p>
                    <p><strong>${nbErreursLignes}</strong> ligne(s) en erreur</p>
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
        if (ligne.nature.toLowerCase().includes('recup')) type = 'RECUP';
        else if (ligne.nature.toLowerCase().includes('rtt')) type = 'RTT';
        else if (ligne.nature.toLowerCase().includes('anticipé')) type = 'CP_N';
        else if (ligne.nature.toLowerCase().includes('cp')) type = 'CP_N';
        
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

// Fonction pour créer une absence
async function creerAbsenceImport(salarieId, absence) {
    const absenceData = {
        salarie_id: salarieId,
        type: absence.type,
        date_debut: absence.date_debut,
        date_fin: absence.date_fin,
        duree_jours: absence.duree_jours,
        duree_heures: absence.duree_heures,
        commentaire: 'Import historique',
        statut: 'valide'
    };
    
    return await window.api.createAbsence(absenceData);
}
// Écouter les traitements automatiques depuis le main process
if (window.api.onTraitementAutomatique) {
    window.api.onTraitementAutomatique((data) => {
        console.log('Traitement automatique reçu:', data);
        
        const typeLabel = data.type === 'CP_ANNUEL' ? 'CP Annuel' : 'RTT Annuel';
        
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
            ['Nom', 'Prénom', 'Email', 'Type Contrat', 'CP/mois', 'RTT', 'Récup', 'CP N-1', 'CP N', 'RTT', 'Récup (h)']
        ];
        
        for (const salarie of salaries) {
            if (salarie.actif !== 1) continue;
            
            const soldes = await window.api.getSoldes(salarie.id, annee);
            
            dataSoldes.push([
                salarie.nom,
                salarie.prenom,
                salarie.email,
                salarie.type_contrat,
                salarie.cp_mensuel,
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
            // Décomposer en jours
            let currentDate = new Date(dateDebut);
            
           while (currentDate <= dateFin) {
                const jour = currentDate.getDate();
                    const mois = currentDate.getMonth() + 1;
                    const anneeAbs = currentDate.getFullYear();
                    
                    dataArchives.push([
                        '', '', '', // Colonnes A, B, C vides
                        `${salarie.nom} ${salarie.prenom}`,
                        new Date(anneeAbs, mois - 1, jour),
                        natureAbsence,
                        jour,
                        mois,
                        anneeAbs,
                        1,
                        'Journée'
                    ]);
                
                
                // Jour suivant
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
        
        // Afficher chaque notification
        for (const notif of notifications) {
            afficherNotificationPersistanteAvecId(
                notif.id,
                notif.statut,
                notif.titre,
                notif.message,
                notif.date_creation
            );
        }
        
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
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
    
    // Initialiser le header selon la section active au chargement
    const activeSection = document.querySelector('.nav-btn.active');
    if (activeSection) {
        const sectionName = activeSection.getAttribute('data-section');
        const headerDefault = document.getElementById('headerAdminDefault');
        const headerMesConges = document.getElementById('headerAdminMesConges');
        
        if (sectionName === 'mes-conges') {
            headerDefault.style.display = 'none';
            headerMesConges.style.display = 'flex';
        } else {
            headerDefault.style.display = 'block';
            headerMesConges.style.display = 'none';
        }
    }
    
    // Charger les notifications non lues
    await chargerNotificationsNonLues();
}
// ========== SECTION HISTORIQUE COMPLET ==========

let toutesLesAbsences = [];
let tousSalaries = [];

// ========== SECTION HISTORIQUE - CALENDRIER ==========

let anneeHistorique = new Date().getFullYear();
let salarieHistoriqueSelectionne = null;
let absencesHistorique = [];
let joursFeriesHistorique = [];
let absenceCliquee = null;
let jourClique = null;

async function chargerHistoriqueComplet() {
    try {
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
        
        // Afficher l'année
        document.getElementById('anneeHistorique').textContent = anneeHistorique;
        
        // Événements
        select.addEventListener('change', (e) => {
            salarieHistoriqueSelectionne = e.target.value ? parseInt(e.target.value) : null;
            chargerCalendrierHistorique();
        });
        
        document.getElementById('btnPrevYearHistorique').addEventListener('click', () => {
            anneeHistorique--;
            document.getElementById('anneeHistorique').textContent = anneeHistorique;
            chargerCalendrierHistorique();
        });
        
        document.getElementById('btnNextYearHistorique').addEventListener('click', () => {
            anneeHistorique++;
            document.getElementById('anneeHistorique').textContent = anneeHistorique;
            chargerCalendrierHistorique();
        });
        
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
        document.getElementById('soldeCPN1Historique').textContent = soldes ? `${soldes.cp_n1.toFixed(1)}j` : '0j';
        document.getElementById('soldeCPNHistorique').textContent = soldes ? `${soldes.cp_n.toFixed(1)}j` : '0j';
        document.getElementById('soldeRTTHistorique').textContent = soldes ? `${soldes.rtt.toFixed(1)}j` : '0j';
        document.getElementById('soldeRecupHistorique').textContent = soldes ? `${soldes.recup_heures.toFixed(1)}h` : '0h';
        
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
                if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                    jourDiv.classList.add('cp');
                } else if (type === 'RTT') {
                    jourDiv.classList.add('rtt');
                } else if (type === 'RECUP') {
                    jourDiv.classList.add('recup');
                } else if (type === 'MALADIE') {
                    jourDiv.classList.add('maladie');
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
    
    // Cas 1 : Supprimer le premier jour
    if (dateISO === absence.date_debut) {
        const nouvelleDateDebut = new Date(dateASupprimer);
        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + 1);
        
        // Modifier l'absence existante
        await window.api.updateAbsence(absence.id, {
            date_debut: formatDateISO(nouvelleDateDebut),
            duree_jours: absence.duree_jours - 1,
            duree_heures: absence.duree_heures - 7
        });
        
        alert('✅ Premier jour supprimé !\nLes soldes ont été recalculés.');
        return;
    }
    
    // Cas 2 : Supprimer le dernier jour
    if (dateISO === absence.date_fin) {
        const nouvelleDateFin = new Date(dateASupprimer);
        nouvelleDateFin.setDate(nouvelleDateFin.getDate() - 1);
        
        await window.api.updateAbsence(absence.id, {
            date_fin: formatDateISO(nouvelleDateFin),
            duree_jours: absence.duree_jours - 1,
            duree_heures: absence.duree_heures - 7
        });
        
        alert('✅ Dernier jour supprimé !\nLes soldes ont été recalculés.');
        return;
    }
    
    // Cas 3 : Supprimer un jour au milieu (couper en 2)
    const jourAvant = new Date(dateASupprimer);
    jourAvant.setDate(jourAvant.getDate() - 1);
    
    const jourApres = new Date(dateASupprimer);
    jourApres.setDate(jourApres.getDate() + 1);
    
    // Calculer les durées
    const joursPartie1 = Math.ceil((jourAvant - dateDebut) / (1000 * 60 * 60 * 24)) + 1;
    const joursPartie2 = Math.ceil((dateFin - jourApres) / (1000 * 60 * 60 * 24)) + 1;
    
    // Modifier l'absence existante (première partie)
    await window.api.updateAbsence(absence.id, {
        date_fin: formatDateISO(jourAvant),
        duree_jours: joursPartie1,
        duree_heures: joursPartie1 * 7
    });
    
    // Créer une nouvelle absence (deuxième partie)
    await window.api.createAbsence({
        salarie_id: absence.salarie_id,
        type: absence.type,
        date_debut: formatDateISO(jourApres),
        date_fin: absence.date_fin,
        duree_jours: joursPartie2,
        duree_heures: joursPartie2 * 7,
        commentaire: absence.commentaire,
        statut: 'valide'
    });
    
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
        const periodeType = document.getElementById('periodeTypeUser').value;
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
                const result = await window.api.calculerDuree(dateDebut, dateFin, periodeType);
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
                statut: 'valide'
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
                        prenom: salarieInfo.prenom
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