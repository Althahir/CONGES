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

// Badge DEV en mode développement (DB locale, prod intacte)
window.api.getIsDev().then(isDev => {
    const badge = document.getElementById('devBadge');
    if (badge && isDev) badge.style.display = 'inline-block';
}).catch(() => { /* silencieux */ });

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
let heuresRecupPosees = []; // saisies hsup négatives (récup posée) à afficher sur le calendrier
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
                    const txt = valeur % 1 === 0 ? valeur : valeur.toFixed(2);
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
                    `${soldes.recup_heures.toFixed(2)}h<p>(${recupJours}j)</p>`;
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
        
        // Afficher le bouton "Heures sup" si le salarié a droit récup
        const btnHeuresSup = document.getElementById('btnAjouterHeuresSup');
        const aDroitRecup = salarie && salarie.a_droit_recup === 1;
        if (btnHeuresSup) btnHeuresSup.style.display = aDroitRecup ? 'block' : 'none';

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

        // Charger les heures de récup posées (saisies hsup négatives) pour le calendrier
        try {
            const allHsup = await window.api.getHeuresSup(user.id);
            heuresRecupPosees = allHsup.filter(h => Number(h.heures) < 0);
        } catch (e) { heuresRecupPosees = []; }

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

// Modale de confirmation jolie réutilisable. Retourne une promise true/false.
function confirmModal({ titre, message, info, iconClass, confirmText, confirmClass, cancelText, checkboxLabel, checkboxChecked }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal';
        overlay.style.display = 'flex';
        // Si checkboxLabel est fourni : retourne { confirmed, checkboxChecked }
        // Sinon (rétro-compat) : retourne directement le boolean.
        const hasCheckbox = !!checkboxLabel;
        const checkboxHtml = hasCheckbox
            ? `<label class="confirm-modal-checkbox"><input type="checkbox" class="js-checkbox" ${checkboxChecked ? 'checked' : ''}> ${escapeHtmlUser(checkboxLabel)}</label>`
            : '';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 440px;">
                <div class="modal-header">
                    <h3><i class="fa-solid ${iconClass || 'fa-circle-question'}"></i> ${escapeHtmlUser(titre)}</h3>
                    <button class="close-modal js-close"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${info ? `<p class="info-refus-demande">${info}</p>` : ''}
                    <p class="texte-refus-demande">${escapeHtmlUser(message)}</p>
                    ${checkboxHtml}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary js-cancel">${escapeHtmlUser(cancelText || 'Annuler')}</button>
                    <button class="${confirmClass || 'btn-primary'} js-confirm">${escapeHtmlUser(confirmText || 'Confirmer')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = (confirmed) => {
            const cbState = hasCheckbox ? overlay.querySelector('.js-checkbox').checked : false;
            overlay.remove();
            resolve(hasCheckbox ? { confirmed, checkboxChecked: cbState } : confirmed);
        };
        overlay.querySelector('.js-close').addEventListener('click', () => close(false));
        overlay.querySelector('.js-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.js-confirm').addEventListener('click', () => close(true));
    });
}

async function chargerMesDemandesEnCours(toutesAbsences) {
    const section = document.getElementById('mesDemandesCours');
    const liste = document.getElementById('mesDemandesCoursListe');
    if (!section || !liste) return;

    const enAttente = (toutesAbsences || []).filter(a => a.statut === 'en_attente');

    // Récupérer aussi les saisies de récup en attente du user
    let hsupEnAttente = [];
    try {
        const allHsup = await window.api.getHeuresSup(user.id);
        hsupEnAttente = allHsup.filter(h => h.statut === 'en_attente');
    } catch (e) { console.error('Erreur chargement hsup en attente:', e); }

    if (enAttente.length === 0 && hsupEnAttente.length === 0) {
        section.style.display = 'none';
        liste.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    const fmtDate = (d) => d.split('-').reverse().slice(0, 2).join('/');
    const labelsType = { CP: 'CP', CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };

    const itemsAbsences = enAttente.map(d => {
        // Pour les RECUP, on affiche toujours en heures (la durée en jours est moins parlante : 0.5j vs 3h ou 4h)
        const dureeStr = d.type === 'RECUP'
            ? `${Number(d.duree_heures || 0)}h`
            : `${(d.duree_jours || 0).toFixed(2)}j`;
        const periode = d.date_debut === d.date_fin ? fmtDate(d.date_debut) : `${fmtDate(d.date_debut)} → ${fmtDate(d.date_fin)}`;
        return `
            <div class="mes-demande-item" data-kind="absence" data-id="${d.id}">
                <div>
                    <div class="mes-demande-item-type">${labelsType[d.type] || d.type} · ${dureeStr}</div>
                    <div class="mes-demande-item-dates">${periode}</div>
                </div>
                <button class="mes-demande-item-delete" title="Annuler ma demande" aria-label="Annuler">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    const itemsHsup = hsupEnAttente.map(h => {
        const heuresAbs = Math.abs(Number(h.heures));
        return `
            <div class="mes-demande-item" data-kind="hsup" data-id="${h.id}">
                <div>
                    <div class="mes-demande-item-type">Récup · ${heuresAbs}h</div>
                    <div class="mes-demande-item-dates">${fmtDate(h.date)}</div>
                </div>
                <button class="mes-demande-item-delete" title="Annuler ma demande" aria-label="Annuler">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    liste.innerHTML = itemsAbsences + itemsHsup;

    // Bouton supprimer/annuler ma demande
    liste.querySelectorAll('.mes-demande-item-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.mes-demande-item');
            if (!item) return;
            const kind = item.dataset.kind;
            const id = parseInt(item.dataset.id, 10);
            const typeTexte = item.querySelector('.mes-demande-item-type')?.textContent.trim() || '';
            const datesTexte = item.querySelector('.mes-demande-item-dates')?.textContent.trim() || '';
            const info = `<strong>${escapeHtmlUser(typeTexte)}</strong><br>${escapeHtmlUser(datesTexte)}`;
            // Pour les absences, propose en plus de retirer l'event du calendrier
            // Outlook (la pose user a déclenché un PUBLISH automatique en v1.2).
            // Pour les hsup, pas d'ICS associé donc pas de checkbox.
            const opts = {
                titre: 'Annuler la demande',
                info,
                message: 'Confirmer l\'annulation de cette demande en attente ?',
                iconClass: 'fa-circle-xmark',
                confirmText: 'Annuler la demande',
                confirmClass: 'btn-danger',
                cancelText: 'Conserver'
            };
            if (kind === 'absence') {
                opts.checkboxLabel = 'Retirer également de mon calendrier Outlook';
                opts.checkboxChecked = true;
            }
            const res = await confirmModal(opts);
            const confirmed = (kind === 'absence') ? res.confirmed : res;
            const retirerCalendrier = (kind === 'absence') ? res.checkboxChecked : false;
            if (!confirmed) return;
            try {
                if (kind === 'absence') {
                    // ICS CANCEL AVANT le DELETE (l'absence existe encore en DB)
                    if (retirerCalendrier) {
                        try {
                            await window.api.genererIcsAbsence(id, { method: 'CANCEL', sequence: 1, includeName: false });
                        } catch (errIcs) { console.error('[ICS CANCEL]', errIcs); }
                    }
                    await window.api.deleteAbsence(id);
                } else if (kind === 'hsup') {
                    await window.api.deleteHeureSup({ id, actorId: user.id });
                }
                await chargerAbsences();
                await loadSoldes();
                genererCalendrier();
            } catch (err) {
                console.error('Erreur annulation demande:', err);
                alert('Erreur : ' + (err.message || err));
            }
        });
    });
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
                    tooltipLabel = 'Récup.';
                } else if (type === 'MALADIE') {
                    jourDiv.classList.add('maladie');
                    tooltipLabel = 'Arrêt maladie';
                }

                // Marquer en attente de validation
                if (absence.statut === 'en_attente') {
                    jourDiv.classList.add('en-attente');
                    tooltipLabel += ' — En attente de validation';
                }

                // Demi-journées : dégradé horizontal (matin = gauche, après-midi = droite)
                const estPremier = dateISO === absence.date_debut;
                const estDernier = dateISO === absence.date_fin;
                if (estPremier && absence.debut_periode === 'apres-midi') {
                    jourDiv.classList.add('demi-pm');
                    tooltipLabel += ' (après-midi)';
                }
                if (estDernier && absence.fin_periode === 'midi') {
                    jourDiv.classList.add('demi-am');
                    tooltipLabel += ' (matin)';
                }

                // Ajouter le commentaire si présent (sur une nouvelle ligne)
                if (absence.commentaire) {
                    tooltipLabel += `\n${absence.commentaire}`;
                }
                if (tooltipLabel) jourDiv.setAttribute('data-tooltip', tooltipLabel);

                // Si l'absence est en attente, clic = scroll vers la card "Mes demandes en cours"
                if (absence.statut === 'en_attente') {
                    jourDiv.style.cursor = 'pointer';
                    jourDiv.addEventListener('click', () => {
                        const item = document.querySelector(`.mes-demande-item[data-kind="absence"][data-id="${absence.id}"]`);
                        if (item) {
                            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            item.classList.add('mes-demande-item-highlight');
                            setTimeout(() => item.classList.remove('mes-demande-item-highlight'), 2000);
                        }
                    });
                }
            }

            // Heures de récup posées (saisies hsup négatives) — affichées même par-dessus une demi-journée d'absence
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !jourFerie) {
                const saisiesJour = heuresRecupPosees.filter(h => h.date === dateISO);
                if (saisiesJour.length > 0) {
                    const totalHeures = saisiesJour.reduce((s, h) => s + Math.abs(Number(h.heures)), 0);
                    const enAttente = saisiesJour.some(h => h.statut === 'en_attente');
                    jourDiv.classList.add('hsup-pose');
                    if (enAttente) jourDiv.classList.add('en-attente');

                    const coin = document.createElement('span');
                    coin.className = 'hsup-coin';
                    jourDiv.appendChild(coin);

                    const badge = document.createElement('span');
                    badge.className = 'hsup-badge';
                    badge.textContent = `${totalHeures}h`;
                    jourDiv.appendChild(badge);

                    // Tooltip détaillée — on ignore les commentaires auto-générés (redondants avec la date)
                    const commentaireGenerique = /^(Récupération d'heures|Heures supplémentaires) du \d{4}-\d{2}-\d{2}$/;
                    const lignes = saisiesJour.map(h => {
                        const hAbs = Math.abs(Number(h.heures));
                        const att = h.statut === 'en_attente' ? ' (en attente)' : '';
                        const com = h.commentaire && !commentaireGenerique.test(h.commentaire) ? h.commentaire : null;
                        return com ? `${hAbs}h · ${com}${att}` : `${hAbs}h${att}`;
                    });
                    const tooltipHsup = `Récup.\n${lignes.join('\n')}`;
                    const existing = jourDiv.getAttribute('data-tooltip');
                    jourDiv.setAttribute('data-tooltip', existing ? `${existing}\n${tooltipHsup}` : tooltipHsup);

                    // Saisie hsup en attente : clic = scroll vers la card "Mes demandes en cours"
                    if (enAttente) {
                        const hsupId = saisiesJour.find(h => h.statut === 'en_attente').id;
                        jourDiv.style.cursor = 'pointer';
                        jourDiv.addEventListener('click', () => {
                            const item = document.querySelector(`.mes-demande-item[data-kind="hsup"][data-id="${hsupId}"]`);
                            if (item) {
                                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                item.classList.add('mes-demande-item-highlight');
                                setTimeout(() => item.classList.remove('mes-demande-item-highlight'), 2000);
                            }
                        });
                    }
                }
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
        if (typeof resetPeriodTogglesUser === 'function') resetPeriodTogglesUser();
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

// Afficher/masquer les champs spécifiques Récup (legacy : les inputs sont désormais hidden)
document.getElementById('typeAbsence').addEventListener('change', (e) => {
    const recupFields = document.getElementById('recupFields');
    if (recupFields) {
        recupFields.style.display = e.target.value === 'RECUP' ? 'block' : 'none';
    }
});

// Afficher/masquer le champ heures selon le type de récup
document.getElementById('recupType').addEventListener('change', (e) => {
    const recupHeuresGroup = document.getElementById('recupHeuresGroup');
    const recupHeuresInput = document.getElementById('recupHeures');
    if (recupHeuresGroup) {
        recupHeuresGroup.style.display = e.target.value === 'heures' ? 'block' : 'none';
    }
    if (recupHeuresInput) {
        recupHeuresInput.required = e.target.value === 'heures';
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
    if (type === 'RECUP' && recupType === 'heures' && parseFloat(recupHeures) > 2.5) {
        manquants.push('au-delà de 2h30, posez une demi-journée');
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
    dureeHeures = result.dureeHeures;

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
                <tr><td><strong>CP N-1</strong></td><td>${decompteCP_N1.toFixed(2)}j</td><td>${nouveauCP_N1.toFixed(2)}j</td></tr>
                <tr><td><strong>CP N</strong></td><td>${decompteCP_N.toFixed(2)}j</td><td style="color:${nouveauCP_N < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauCP_N.toFixed(2)}j</td></tr>
            </table>`;

            if (nouveauCP_N < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauCP_N).toFixed(2)}j`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = '✓ Solde suffisant';
            }

        } else if (typeAbsence === 'RTT') {
            const nouveauRTT = soldes.rtt - dureeJours;
            resumeDecompteEl.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>RTT</strong></td><td>${dureeJours.toFixed(2)}j</td><td style="color:${nouveauRTT < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauRTT.toFixed(2)}j</td></tr>
            </table>`;

            if (nouveauRTT < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRTT).toFixed(2)}j`;
                alerteSolde.classList.add('show', 'alert-warning');
            } else {
                alerteSolde.textContent = '✓ Solde suffisant';
            }

        } else if (typeAbsence === 'RECUP') {
            // Plafond RECUP horaire à 2h30 : au-delà, demi-journée obligatoire
            if (recupType === 'heures' && parseFloat(recupHeures) > 2.5) {
                alertePeriode.textContent = '⚠️ Au-delà de 2h30, posez une demi-journée (matin ou après-midi) au lieu d\'heures';
                alertePeriode.classList.add('show', 'alert-warning');
            }

            const nouveauRecup = soldes.recup_heures - dureeHeures;
            resumeDecompteEl.innerHTML = `<table>
                <tr><th></th><th>Posé</th><th>Reste</th></tr>
                <tr><td><strong>Récup</strong></td><td>${dureeHeures.toFixed(2)}h</td><td style="color:${nouveauRecup < 0 ? 'var(--rouge)' : 'inherit'}">${nouveauRecup.toFixed(2)}h</td></tr>
            </table>`;

            if (nouveauRecup < 0) {
                alerteSolde.textContent = `⚠️ Solde négatif de ${Math.abs(nouveauRecup).toFixed(2)}h`;
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
                ? `${dureeHeures.toFixed(2)} h` 
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

// Réinitialise les toggles de période (matin pour début, après-midi pour fin)
// à appeler dès qu'une nouvelle plage de dates est sélectionnée.
function resetPeriodTogglesUser() {
    const debutHidden = document.getElementById('debutAprem');
    const finHidden = document.getElementById('finMidi');
    if (debutHidden) debutHidden.value = 'am';
    if (finHidden) finHidden.value = 'pm';
    document.querySelectorAll('#mes-conges-section .period-toggle').forEach(toggle => {
        toggle.querySelectorAll('.period-btn').forEach(b => {
            const target = b.dataset.target;
            const expected = target === 'debutAprem' ? 'am' : 'pm';
            b.classList.toggle('active', b.dataset.value === expected);
        });
    });
}

// Calculer automatiquement quand les champs changent
document.getElementById('typeAbsence').addEventListener('change', () => { calculerDureeAbsence(); updateBtnValider(); });
document.getElementById('dateDebut').addEventListener('change', () => { resetPeriodTogglesUser(); calculerDureeAbsence(); });
document.getElementById('dateFin').addEventListener('change', () => { resetPeriodTogglesUser(); calculerDureeAbsence(); });
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
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (window._pollingIntervalId) {
        clearInterval(window._pollingIntervalId);
        window._pollingIntervalId = null;
    }
    sessionStorage.removeItem('user');
    await window.api.navigateTo('login.html');
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
            if (parseFloat(recupHeures) > 2.5) {
                errorMessage.textContent = 'Au-delà de 2h30, posez une demi-journée au lieu d\'heures.';
                errorMessage.classList.add('show');
                return;
            }
            dureeHeures = parseFloat(recupHeures);
            dureeJours = dureeHeures / 7;
        } else {
            const result = await window.api.calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode);
            dureeJours = result.dureeJours;
            dureeHeures = result.dureeHeures;
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
            // Génération ICS immédiate dans le calendrier perso de l'utilisateur,
            // dès la pose (sans attendre la validation admin). Cohérent : la majorité
            // des demandes sont validées, et un éventuel refus déclenchera un toast
            // avec bouton « Retirer de mon calendrier » côté user.
            try {
                await window.api.genererIcsAbsence(resultAbsence.id, { includeName: false });
            } catch (errIcs) {
                console.error('[ICS] Erreur génération à la pose:', errIcs);
            }

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
                dureeHeures,
                resultAbsence.id
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
                ? `${abs.duree_jours.toFixed(2)}j`
                : `${abs.duree_heures.toFixed(2)}h`;
            
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

    const toggle = document.getElementById('hsupTypeToggle');
    const headerHsup = document.getElementById('hsupModalHeader');
    const titreHsup = document.getElementById('hsupModalTitre');
    function appliquerHabillageHsup(type) {
        if (!headerHsup || !titreHsup) return;
        const btnEnreg = document.getElementById('btnEnregistrerHeuresSup');
        if (type === 'retrait') {
            headerHsup.classList.add('hsup-retrait');
            titreHsup.textContent = 'Déclarer une absence (en heures)';
            if (btnEnreg) btnEnreg.classList.add('hsup-retrait');
        } else {
            headerHsup.classList.remove('hsup-retrait');
            titreHsup.textContent = 'Déclarer des heures supp. faites';
            if (btnEnreg) btnEnreg.classList.remove('hsup-retrait');
        }
        verifierLimiteHsup();
    }
    async function verifierLimiteHsup() {
        const input = document.getElementById('heuresSupNb');
        const dateInput = document.getElementById('heuresSupDate');
        const msg = document.getElementById('heuresSupMsg');
        const btnEnreg = document.getElementById('btnEnregistrerHeuresSup');
        if (!input || !msg) return;
        const type = (toggle && toggle.dataset.activeType) || 'credit';
        const val = parseFloat(input.value);

        // Limite 2h30 sur les retraits
        if (type === 'retrait' && !isNaN(val) && val > 2.5) {
            msg.textContent = "Au-delà de 2h30, posez une demi-journée (formulaire d'absence) au lieu d'heures.";
            msg.className = 'form-error';
            msg.style.display = 'block';
            if (btnEnreg) btnEnreg.disabled = true;
            return;
        }

        // Pas de retrait un week-end ni un jour férié, ni un jour déjà couvert par une absence
        if (type === 'retrait' && dateInput && dateInput.value) {
            const [y, m, d] = dateInput.value.split('-').map(Number);
            const dayOfWeek = new Date(y, m - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                msg.textContent = "Impossible de poser une absence un week-end.";
                msg.className = 'form-error';
                msg.style.display = 'block';
                if (btnEnreg) btnEnreg.disabled = true;
                return;
            }
            try {
                const feries = await window.api.getJoursFeries(y);
                if (feries.some(f => f.date === dateInput.value)) {
                    const ferie = feries.find(f => f.date === dateInput.value);
                    msg.textContent = `Impossible de poser une absence un jour férié (${ferie.libelle}).`;
                    msg.className = 'form-error';
                    msg.style.display = 'block';
                    if (btnEnreg) btnEnreg.disabled = true;
                    return;
                }
            } catch (e) { /* en cas d'erreur, on ne bloque pas */ }

            try {
                const absencesUser = await window.api.getAbsences(user.id);
                const d = dateInput.value;
                const conflit = absencesUser.find(a => {
                    if (d < a.date_debut || d > a.date_fin) return false;
                    if (d > a.date_debut && d < a.date_fin) return true;
                    if (d === a.date_debut && a.debut_periode === 'apres-midi') return false;
                    if (d === a.date_fin && a.fin_periode === 'midi') return false;
                    return true;
                });
                if (conflit) {
                    msg.textContent = "Une absence couvre déjà toute la journée.";
                    msg.className = 'form-error';
                    msg.style.display = 'block';
                    if (btnEnreg) btnEnreg.disabled = true;
                    return;
                }
            } catch (e) { /* ignorer */ }
        }

        if (msg.classList.contains('form-error')) msg.style.display = 'none';
        if (btnEnreg) btnEnreg.disabled = false;
    }
    if (toggle) {
        toggle.querySelectorAll('.hsup-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                toggle.dataset.activeType = btn.dataset.type;
                toggle.querySelectorAll('.hsup-type-btn').forEach(b => b.classList.toggle('active', b === btn));
                appliquerHabillageHsup(btn.dataset.type);
            });
        });
    }
    const heuresInput = document.getElementById('heuresSupNb');
    if (heuresInput) heuresInput.addEventListener('input', verifierLimiteHsup);
    const dateHsupInput = document.getElementById('heuresSupDate');
    if (dateHsupInput) dateHsupInput.addEventListener('change', verifierLimiteHsup);

    // Fonction réutilisable pour ouvrir la modale de saisie (toggle reset à crédit)
    function ouvrirSaisieHeuresSup() {
        document.getElementById('heuresSupMsg').style.display = 'none';
        if (toggle) {
            toggle.dataset.activeType = 'credit';
            toggle.querySelectorAll('.hsup-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'credit'));
        }
        appliquerHabillageHsup('credit');
        modal.style.display = 'flex';
    }

    // Bouton principal "Heures sup" → ouvre la modale de choix (voir / saisir)
    document.getElementById('btnAjouterHeuresSup').addEventListener('click', () => {
        document.getElementById('modalChoixHeuresSup').style.display = 'flex';
    });

    // Boutons de la modale de choix
    const fermerChoix = () => { document.getElementById('modalChoixHeuresSup').style.display = 'none'; };
    document.getElementById('closeModalChoixHeuresSup').addEventListener('click', fermerChoix);
    document.getElementById('btnChoixVoirSaisies').addEventListener('click', async () => {
        fermerChoix();
        await ouvrirModalHistoriqueRecup();
    });
    document.getElementById('btnChoixNouvelleSaisie').addEventListener('click', () => {
        fermerChoix();
        ouvrirSaisieHeuresSup();
    });

    document.getElementById('closeModalHeuresSup').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnAnnulerHeuresSup').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnEnregistrerHeuresSup').addEventListener('click', async () => {
        const heuresAbs = parseFloat(document.getElementById('heuresSupNb').value);
        const date = document.getElementById('heuresSupDate').value;
        const commentaire = document.getElementById('heuresSupCommentaire').value.trim();
        const msg = document.getElementById('heuresSupMsg');
        const type = (toggle && toggle.dataset.activeType) || 'credit';

        if (!heuresAbs || heuresAbs <= 0 || !date) {
            msg.textContent = "Veuillez renseigner le nombre d'heures et la date.";
            msg.className = 'form-error';
            msg.style.display = 'block';
            return;
        }

        if (type === 'retrait' && heuresAbs > 2.5) {
            msg.textContent = "Au-delà de 2h30, posez une demi-journée (formulaire d'absence) au lieu d'heures.";
            msg.className = 'form-error';
            msg.style.display = 'block';
            return;
        }

        if (type === 'retrait') {
            const [y, m, d] = date.split('-').map(Number);
            const dayOfWeek = new Date(y, m - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                msg.textContent = "Impossible de poser une absence un week-end.";
                msg.className = 'form-error';
                msg.style.display = 'block';
                return;
            }
            try {
                const feries = await window.api.getJoursFeries(y);
                const ferie = feries.find(f => f.date === date);
                if (ferie) {
                    msg.textContent = `Impossible de poser une absence un jour férié (${ferie.libelle}).`;
                    msg.className = 'form-error';
                    msg.style.display = 'block';
                    return;
                }
            } catch (e) { /* ignorer */ }
            try {
                const absencesUser = await window.api.getAbsences(user.id);
                const conflit = absencesUser.find(a => {
                    if (date < a.date_debut || date > a.date_fin) return false;
                    if (date > a.date_debut && date < a.date_fin) return true;
                    if (date === a.date_debut && a.debut_periode === 'apres-midi') return false;
                    if (date === a.date_fin && a.fin_periode === 'midi') return false;
                    return true;
                });
                if (conflit) {
                    msg.textContent = "Une absence couvre déjà toute la journée.";
                    msg.className = 'form-error';
                    msg.style.display = 'block';
                    return;
                }
            } catch (e) { /* ignorer */ }
        }

        const heures = type === 'retrait' ? -heuresAbs : heuresAbs;

        try {
            const result = await window.api.ajouterRecup({
                salarie_id: user.id,
                annee: new Date(date).getFullYear(),
                heures,
                date,
                commentaire: commentaire || null
            });

            if (result.statut === 'en_attente') {
                msg.textContent = `Demande de ${heuresAbs}h envoyée — en attente de validation par l'administrateur.`;
            } else {
                msg.textContent = type === 'retrait'
                    ? `${heuresAbs}h retirées du solde.`
                    : `${heuresAbs}h ajoutées au solde.`;
            }
            msg.className = 'form-success';
            msg.style.display = 'block';

            await loadSoldes();
            await chargerAbsences();
            genererCalendrier();

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
                    // Tooltip de cellule : ne lister que les absences validées (en_attente exclues)
                    const absentsValides = absentsJour.filter(abs => abs.statut !== 'en_attente');
                    if (absentsValides.length > 0) {
                        const noms = absentsValides.map(abs => `${abs.prenom} ${abs.nom}`).join(', ');
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
                        const periodesIndicateurs = new Array(8).fill(null);
                        const statutsIndicateurs = new Array(8).fill(null);
                        const nomsSalariesInd = new Array(8).fill(null);
                        absentsJour.forEach(abs => {
                            const position = positionsSalaries[abs.salarie_id];
                            if (position !== undefined && position < 8) {
                                let periode = 'plein';
                                if (dateISO === abs.date_debut && abs.debut_periode === 'apres-midi') periode = 'apres-midi';
                                else if (dateISO === abs.date_fin && abs.fin_periode === 'midi') periode = 'matin';
                                indicateurs[position] = couleursSalaries[abs.salarie_id];
                                periodesIndicateurs[position] = periode;
                                statutsIndicateurs[position] = abs.statut;
                                nomsSalariesInd[position] = `${abs.prenom} ${abs.nom}`;
                            }
                        });
                        indicateurs.forEach((couleur, idx) => {
                            if (!couleur) {
                                tableHTML += '<div class="indicateur-colonne"></div>';
                                return;
                            }
                            const periode = periodesIndicateurs[idx];
                            const enAttente = statutsIndicateurs[idx] === 'en_attente';
                            const classeAttente = enAttente ? ' en-attente' : '';
                            let suffixe = enAttente ? ' (en attente)' : '';
                            if (periode === 'matin') suffixe = ' · matin' + suffixe;
                            else if (periode === 'apres-midi') suffixe = ' · après-midi' + suffixe;
                            let bg = couleur;
                            if (periode === 'matin') bg = `linear-gradient(to bottom, ${couleur} 50%, transparent 50%)`;
                            else if (periode === 'apres-midi') bg = `linear-gradient(to top, ${couleur} 50%, transparent 50%)`;
                            tableHTML += `<div class="indicateur-colonne actif${classeAttente}" style="background: ${bg};" data-tooltip="${nomsSalariesInd[idx]}${suffixe}"></div>`;
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

    // Afficher au chargement les notifs workflow non lues (validation/refus reçus en absence du user).
    // Pour validations/refus : on regroupe via _purgerBufferValidation() (toast unique si plusieurs).
    const _idsNotifsVues = new Set();
    try {
        const initNotifs = await window.api.getNotificationsNonLues(user.id);
        for (const notif of (initNotifs || [])) {
            if (_idsNotifsVues.has(notif.id)) continue;
            _idsNotifsVues.add(notif.id);
            _hydrateAbsenceIdFromDetails(notif);
            if (notif.type === 'demande_validee' || notif.type === 'recup_validee') {
                _bufferValidees.push(notif);
            } else if (notif.type === 'demande_refusee' || notif.type === 'recup_refusee') {
                _bufferRefusees.push(notif);
            } else if (notif.type === 'recup_modifiee' || notif.type === 'recup_supprimee' || notif.type === 'absence_supprimee') {
                afficherToastUser(notif);
            }
        }
        _purgerBufferValidation();
    } catch (e) { console.error('[INIT NOTIFS]', e); }

    // Polling toutes les 30s pour détecter les changements depuis d'autres postes
    // (validation/refus admin, autres poses, traitements auto)
    window._pollingIntervalId = setInterval(async () => {
        try {
            await loadSoldes();
            await chargerAbsences();
            genererCalendrier();

            const calGlobal = document.getElementById('calendrier-global-section');
            if (calGlobal && calGlobal.classList.contains('active')) {
                await chargerCalendrierGlobal();
            }

            // Détecter nouvelles notifications (par id jamais vu) → toast pour les types workflow.
            // Validations / refus regroupés via le buffer (toast unique si plusieurs).
            const notifs = await window.api.getNotificationsNonLues(user.id);
            for (const notif of (notifs || [])) {
                if (_idsNotifsVues.has(notif.id)) continue;
                _idsNotifsVues.add(notif.id);
                _hydrateAbsenceIdFromDetails(notif);
                if (notif.type === 'demande_validee' || notif.type === 'recup_validee') {
                    _bufferValidees.push(notif);
                } else if (notif.type === 'demande_refusee' || notif.type === 'recup_refusee') {
                    _bufferRefusees.push(notif);
                } else if (notif.type === 'recup_modifiee' || notif.type === 'recup_supprimee' || notif.type === 'absence_supprimee') {
                    afficherToastUser(notif);
                }
            }
            _purgerBufferValidation();
        } catch (e) {
            console.error('[POLLING] Erreur:', e);
        }
    }, 30000);
}

// ========== TOAST (workflow validation) — même structure que côté admin ==========
const _toastQueueUser = [];
let _toastActifUser = false;

// Parse `details` (JSON string en DB) pour récupérer absence_id et absence_snapshot
// quand la notif vient du polling/init (les events live les passent déjà au top level).
// Le snapshot est utilisé pour les notifs `absence_supprimee` afin de générer un
// ICS CANCEL malgré que l'absence n'existe plus en DB.
function _hydrateAbsenceIdFromDetails(notif) {
    if ((notif.absence_id && notif.absence_snapshot) || !notif.details) return;
    try {
        const parsed = typeof notif.details === 'string' ? JSON.parse(notif.details) : notif.details;
        if (parsed) {
            if (!notif.absence_id && parsed.absence_id) notif.absence_id = parsed.absence_id;
            if (!notif.absence_snapshot && parsed.absence_snapshot) notif.absence_snapshot = parsed.absence_snapshot;
        }
    } catch (e) { /* details malformé, on ignore */ }
}

function afficherToastUser(notif) {
    // Le son ne joue qu'une fois par rafale : si un toast est déjà visible ou
    // dans la file, ce push rejoint la rafale en silence.
    notif._playSon = !_toastActifUser && _toastQueueUser.length === 0;
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
    // Bouton "Retirer de mon calendrier" — uniquement pour les notifs qui
    // signifient qu'une absence doit disparaître du calendrier du user
    // (suppression admin OU refus admin). Nécessite le snapshot car l'absence
    // est soit supprimée en DB, soit marquée refusée. Depuis v1.2, la pose user
    // génère un ICS direct → plus de bouton "Ajouter" sur la validation.
    const estCancel = (notif.type === 'absence_supprimee' || notif.type === 'demande_refusee')
        && notif.absence_id && notif.absence_snapshot;
    const boutonIcs = estCancel
        ? `<button class="notification-action-ics" type="button" data-mode="cancel"><i class="fa-solid fa-calendar-minus"></i> Retirer de mon calendrier</button>`
        : '';
    toast.innerHTML = `
        <div class="notification-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="notification-content">
            <h4>${titre}</h4>
            <p>${message}</p>
            ${boutonIcs}
        </div>
        <button class="notification-close"><i class="fa-solid fa-times"></i></button>
    `;

    document.body.appendChild(toast);
    if (notif._playSon && typeof window.jouerSonToast === 'function') window.jouerSonToast();

    let dismissed = false;
    const dismiss = async () => {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(autoDismissTimer);
        toast.classList.add('dismissing');
        const idsAMarquer = Array.isArray(notif.ids) ? notif.ids : (notif.id ? [notif.id] : []);
        for (const id of idsAMarquer) {
            try { await window.api.marquerNotificationLue(id); } catch (e) { /* */ }
        }
        setTimeout(() => {
            toast.remove();
            _toastActifUser = false;
            _afficherProchainToastUser();
        }, 300);
    };

    // Auto-dismiss désactivé si on a un bouton d'action (laisser l'utilisateur le temps de cliquer)
    const autoDismissTimer = boutonIcs ? null : setTimeout(dismiss, 5000);
    toast.querySelector('.notification-close').addEventListener('click', dismiss);

    const btnIcs = toast.querySelector('.notification-action-ics');
    if (btnIcs) {
        btnIcs.addEventListener('click', async () => {
            btnIcs.disabled = true;
            try {
                await window.api.genererIcsAbsence(notif.absence_id, {
                    method: 'CANCEL',
                    sequence: 1,
                    includeName: false,
                    absenceSnapshot: notif.absence_snapshot
                });
                btnIcs.innerHTML = '<i class="fa-solid fa-check"></i> Calendrier ouvert';
                // Petit délai pour laisser voir la confirmation visuelle, puis dismiss
                // (qui marque aussi la notif DB comme lue).
                setTimeout(dismiss, 1200);
            } catch (e) {
                console.error('[ICS] Erreur ouverture:', e);
                btnIcs.disabled = false;
            }
        });
    }
}

// Écouter les notifs temps réel envoyées par le main process (workflow validation).
// Si plusieurs validations/refus arrivent en rafale, on regroupe en un seul toast.
let _bufferValidees = [];
let _bufferRefusees = [];
let _bufferDebounce = null;

function _purgerBufferValidation() {
    const v = _bufferValidees; _bufferValidees = [];
    const r = _bufferRefusees; _bufferRefusees = [];

    if (v.length === 1) {
        afficherToastUser({ id: v[0].id || null, titre: v[0].titre, message: v[0].message, statut: 'success', absence_id: v[0].absence_id || null });
    } else if (v.length > 1) {
        afficherToastUser({
            ids: v.map(x => x.id).filter(Boolean),
            titre: `${v.length} demandes validées ✓`,
            message: 'Vos demandes ont été traitées par l\'administrateur.',
            statut: 'success'
        });
    }
    if (r.length === 1) {
        // type 'demande_refusee' préservé pour permettre l'affichage du bouton
        // « Retirer de mon calendrier » via le snapshot embarqué.
        afficherToastUser({
            id: r[0].id || null,
            type: 'demande_refusee',
            titre: r[0].titre,
            message: r[0].message,
            statut: 'error',
            absence_id: r[0].absence_id || null,
            absence_snapshot: r[0].absence_snapshot || null
        });
    } else if (r.length > 1) {
        afficherToastUser({
            ids: r.map(x => x.id).filter(Boolean),
            titre: `${r.length} demandes refusées ✕`,
            message: 'Vos demandes ont été refusées par l\'administrateur.',
            statut: 'error'
        });
    }
}

if (window.api.onTraitementAutomatique) {
    window.api.onTraitementAutomatique(async (data) => {
        const typesUserCibles = ['demande_validee', 'demande_refusee', 'recup_validee', 'recup_refusee'];
        if (typesUserCibles.includes(data.type) && data.user_id === user.id) {
            if (data.statut === 'success') _bufferValidees.push(data);
            else _bufferRefusees.push(data);

            clearTimeout(_bufferDebounce);
            _bufferDebounce = setTimeout(async () => {
                _purgerBufferValidation();
                try {
                    await loadSoldes();
                    await chargerAbsences();
                    genererCalendrier();
                } catch (e) { /* ignorer */ }
            }, 500);
        }

        // Suppression d'absence par l'admin → toast direct (pas de regroupement, événement rare)
        if (data.type === 'absence_supprimee' && data.user_id === user.id) {
            afficherToastUser(data);
            try {
                await loadSoldes();
                await chargerAbsences();
                genererCalendrier();
            } catch (e) { /* ignorer */ }
        }
    });
}

// Toast quand une mise à jour a été téléchargée (en remplacement du dialog Electron par défaut)
if (window.api.onUpdateDownloaded) {
    window.api.onUpdateDownloaded(({ version }) => afficherToastMaj(version));
}

function afficherToastMaj(version) {
    if (document.querySelector('.update-toast')) return; // un seul à la fois
    const toast = document.createElement('div');
    toast.className = 'notification-persistante success update-toast';
    // Pas de bouton de fermeture : l'utilisateur termine ce qu'il fait puis clique Redémarrer
    toast.innerHTML = `
        <div class="notification-icon"><i class="fa-solid fa-cloud-arrow-down"></i></div>
        <div class="notification-content">
            <h4>Mise à jour disponible</h4>
            <p>${version ? 'Version ' + version + ' téléchargée' : 'Une nouvelle version est prête'}</p>
        </div>
        <button class="btn-restart-update" title="Redémarrer pour appliquer la mise à jour">
            <i class="fa-solid fa-rotate-right"></i> Redémarrer
        </button>
    `;
    document.body.appendChild(toast);
    if (typeof window.jouerSonMaj === 'function') window.jouerSonMaj();
    toast.querySelector('.btn-restart-update').addEventListener('click', () => {
        window.api.applyUpdate();
    });
}

// ========== MODALE HISTORIQUE HEURES DE RÉCUP ==========

const NOMS_MOIS_USER = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
let _heuresRecupUserListe = [];
let _filtreAnneeRecupUser = 'all';
let _filtreMoisRecupUser = 'all';
let _heureRecupEnEditionUser = null;

function formatDateFRUser(iso) {
    if (!iso) return '';
    const datePart = String(iso).slice(0, 10);
    const [y, m, d] = datePart.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
}

async function ouvrirModalHistoriqueRecup() {
    _filtreAnneeRecupUser = 'all';
    _filtreMoisRecupUser = 'all';
    _heureRecupEnEditionUser = null;
    await chargerListeHeuresRecupUser();
    document.getElementById('modalHistoriqueRecupUser').style.display = 'flex';
}

async function chargerListeHeuresRecupUser() {
    try {
        _heuresRecupUserListe = await window.api.getHistoriqueRecupComplet(user.id);
    } catch (e) {
        console.error('Erreur chargement historique récup user:', e);
        _heuresRecupUserListe = [];
    }
    renderTableauHeuresRecupUser();
}

function renderTableauHeuresRecupUser() {
    const container = document.getElementById('histoRecupContenuUser');
    if (!_heuresRecupUserListe.length) {
        container.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-secondary);">Aucune heure de récupération enregistrée pour le moment.</p>';
        return;
    }

    const annees = [...new Set(_heuresRecupUserListe.map(h => new Date(h.date).getFullYear()))].sort((a, b) => b - a);
    if (_filtreAnneeRecupUser !== 'all' && !annees.includes(parseInt(_filtreAnneeRecupUser))) {
        _filtreAnneeRecupUser = 'all';
        _filtreMoisRecupUser = 'all';
    }

    const apresAnnee = _filtreAnneeRecupUser === 'all'
        ? _heuresRecupUserListe
        : _heuresRecupUserListe.filter(h => new Date(h.date).getFullYear() === parseInt(_filtreAnneeRecupUser));

    const moisDispos = [...new Set(apresAnnee.map(h => new Date(h.date).getMonth() + 1))].sort((a, b) => a - b);
    if (_filtreMoisRecupUser !== 'all' && !moisDispos.includes(parseInt(_filtreMoisRecupUser))) {
        _filtreMoisRecupUser = 'all';
    }

    const liste = _filtreMoisRecupUser === 'all'
        ? apresAnnee
        : apresAnnee.filter(h => (new Date(h.date).getMonth() + 1) === parseInt(_filtreMoisRecupUser));

    let html = `
        <div class="filtre-recup-row">
            <label for="filtreAnneeRecupUser">Année :</label>
            <select id="filtreAnneeRecupUser">
                <option value="all" ${_filtreAnneeRecupUser === 'all' ? 'selected' : ''}>Toutes (${_heuresRecupUserListe.length})</option>
                ${annees.map(a => {
                    const nb = _heuresRecupUserListe.filter(h => new Date(h.date).getFullYear() === a).length;
                    return `<option value="${a}" ${parseInt(_filtreAnneeRecupUser) === a ? 'selected' : ''}>${a} (${nb})</option>`;
                }).join('')}
            </select>
            <label for="filtreMoisRecupUser">Mois :</label>
            <select id="filtreMoisRecupUser">
                <option value="all" ${_filtreMoisRecupUser === 'all' ? 'selected' : ''}>Tous (${apresAnnee.length})</option>
                ${moisDispos.map(m => {
                    const nb = apresAnnee.filter(h => (new Date(h.date).getMonth() + 1) === m).length;
                    return `<option value="${m}" ${parseInt(_filtreMoisRecupUser) === m ? 'selected' : ''}>${NOMS_MOIS_USER[m - 1]} (${nb})</option>`;
                }).join('')}
            </select>
        </div>
        <table class="tableau-heures-recup">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Heures</th>
                    <th>Commentaire</th>
                    <th>Saisie le</th>
                    <th class="col-actions">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    const tooltipNonModif = "non modifiable";

    for (const h of liste) {
        const enEdition = _heureRecupEnEditionUser === h.id;
        const isReadOnlyPose = h._origine === 'absence_recup';
        const isImport = h.source === 'import_excel';
        const heuresNum = Number(h.heures);
        const isPose = heuresNum < 0;
        // Modifiable si : saisie manuelle ET pas un import ET pas un négatif (pose) ET pas une absence_recup
        const editable = !isReadOnlyPose && !isImport && !isPose;

        const dateSaisieRaw = h.date_creation ? formatDateFRUser(h.date_creation) : '—';
        let badge = '';
        if (isImport) badge = ' <span class="badge-import">(import excel)</span>';
        else if (h.source === 'pose_conge') badge = ' <span class="badge-pose-conge">(congé posé)</span>';
        const dateSaisie = `${dateSaisieRaw}${badge}`;

        const heuresAffichage = isPose
            ? `<span class="heures-pose">${heuresNum.toFixed(2)}h</span>`
            : `<span class="heures-credit">+${heuresNum.toFixed(2)}h</span>`;

        const classes = [];
        if (enEdition) classes.push('ligne-edition');
        if (isPose && !enEdition) classes.push('ligne-pose');

        if (enEdition && editable) {
            html += `
                <tr data-id="${h.id}" class="${classes.join(' ')}">
                    <td><input type="date" class="edit-date" value="${h.date}"></td>
                    <td><input type="number" class="edit-heures" min="0.5" step="0.5" value="${h.heures}"></td>
                    <td><input type="text" class="edit-commentaire" value="${h.commentaire ? h.commentaire.replace(/"/g, '&quot;') : ''}" placeholder="(optionnel)"></td>
                    <td class="cellule-saisie">${dateSaisie}</td>
                    <td class="col-actions">
                        <button class="btn-icone btn-icone-valider" data-action="save" data-id="${h.id}" title="Valider"><i class="fa-solid fa-check"></i></button>
                        <button class="btn-icone btn-icone-annuler" data-action="cancel" data-id="${h.id}" title="Annuler"><i class="fa-solid fa-xmark"></i></button>
                    </td>
                </tr>
            `;
        } else {
            let actionsHTML;
            if (editable) {
                actionsHTML = `
                    <button class="btn-icone btn-icone-edit" data-action="edit" data-id="${h.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icone btn-icone-delete" data-action="delete" data-id="${h.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
                `;
            } else {
                actionsHTML = `
                    <button class="btn-icone btn-icone-edit" disabled title="${escapeHtmlUser(tooltipNonModif)}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icone btn-icone-delete" disabled title="${escapeHtmlUser(tooltipNonModif)}"><i class="fa-solid fa-trash"></i></button>
                `;
            }
            const trTitle = !editable ? ` title="${escapeHtmlUser(tooltipNonModif)}"` : '';
            html += `
                <tr data-id="${h.id}" class="${classes.join(' ')}"${trTitle}>
                    <td>${formatDateFRUser(h.date)}</td>
                    <td>${heuresAffichage}</td>
                    <td class="cellule-commentaire">${h.commentaire ? escapeHtmlUser(h.commentaire) : '<span class="vide">—</span>'}</td>
                    <td class="cellule-saisie">${dateSaisie}</td>
                    <td class="col-actions">${actionsHTML}</td>
                </tr>
            `;
        }
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleActionRecupUser(btn.dataset.action, parseInt(btn.dataset.id)));
    });

    const selectAnnee = document.getElementById('filtreAnneeRecupUser');
    if (selectAnnee) {
        selectAnnee.addEventListener('change', () => {
            _filtreAnneeRecupUser = selectAnnee.value;
            _filtreMoisRecupUser = 'all';
            _heureRecupEnEditionUser = null;
            renderTableauHeuresRecupUser();
        });
    }
    const selectMois = document.getElementById('filtreMoisRecupUser');
    if (selectMois) {
        selectMois.addEventListener('change', () => {
            _filtreMoisRecupUser = selectMois.value;
            _heureRecupEnEditionUser = null;
            renderTableauHeuresRecupUser();
        });
    }
}

async function handleActionRecupUser(action, id) {
    const ligne = _heuresRecupUserListe.find(x => x.id === id);
    // Garde-fou : seules les saisies manuelles positives sont modifiables
    if (!ligne || ligne._origine === 'absence_recup' || ligne.source === 'import_excel' || Number(ligne.heures) < 0) return;

    if (action === 'edit') {
        _heureRecupEnEditionUser = id;
        renderTableauHeuresRecupUser();
    } else if (action === 'cancel') {
        _heureRecupEnEditionUser = null;
        renderTableauHeuresRecupUser();
    } else if (action === 'save') {
        await sauverEditionRecupUser(id);
    } else if (action === 'delete') {
        await supprimerRecupUser(id);
    }
}

async function sauverEditionRecupUser(id) {
    const tr = document.querySelector(`#histoRecupContenuUser tr[data-id="${id}"]`);
    if (!tr) return;
    const date = tr.querySelector('.edit-date').value;
    const heures = parseFloat(tr.querySelector('.edit-heures').value);
    const commentaire = tr.querySelector('.edit-commentaire').value.trim();

    if (!date || isNaN(heures) || heures <= 0) {
        alert('La date est obligatoire et le nombre d\'heures doit être positif.');
        return;
    }

    try {
        await window.api.updateHeureSup({ id, date, heures, commentaire, actorId: user.id });
        _heureRecupEnEditionUser = null;
        await chargerListeHeuresRecupUser();
        await loadSoldes();
        await chargerAbsences();
        genererCalendrier();
    } catch (e) {
        console.error('Erreur modification heure récup:', e);
        alert('Erreur lors de la modification : ' + (e.message || e));
    }
}

async function supprimerRecupUser(id) {
    const ligne = _heuresRecupUserListe.find(x => x.id === id);
    if (!ligne) return;
    const dateAffichee = formatDateFRUser(ligne.date);
    const heuresAffichees = `${Number(ligne.heures).toFixed(2)}h`;
    const commentaireTxt = ligne.commentaire ? `<br>${escapeHtmlUser(ligne.commentaire)}` : '';
    const info = `<strong>${heuresAffichees}</strong> · ${dateAffichee}${commentaireTxt}`;
    const ok = await confirmModal({
        titre: 'Supprimer la saisie',
        info,
        message: 'Votre solde de récupération sera ajusté automatiquement.',
        iconClass: 'fa-trash',
        confirmText: 'Supprimer',
        confirmClass: 'btn-danger'
    });
    if (!ok) return;

    try {
        await window.api.deleteHeureSup({ id, actorId: user.id });
        await chargerListeHeuresRecupUser();
        await loadSoldes();
        await chargerAbsences();
        genererCalendrier();
    } catch (e) {
        console.error('Erreur suppression heure récup:', e);
        alert('Erreur lors de la suppression : ' + (e.message || e));
    }
}

(function initModalHistoriqueRecupUser() {
    // Le bouton d'ouverture est dans la modale de choix (initModalHeuresSup),
    // pas besoin de listener supplémentaire ici.
    const btnClose = document.getElementById('closeModalHistoriqueRecupUser');
    if (btnClose) btnClose.addEventListener('click', () => {
        document.getElementById('modalHistoriqueRecupUser').style.display = 'none';
    });
    const btnFermer = document.getElementById('btnFermerHistoRecupUser');
    if (btnFermer) btnFermer.addEventListener('click', () => {
        document.getElementById('modalHistoriqueRecupUser').style.display = 'none';
    });
})();

init();