# CLAUDE.md — Contexte projet pour Claude Code

> Ce fichier est chargé automatiquement par Claude Code à chaque session.
> Il contient tout ce qu'il faut pour reprendre le projet sans re-briefing.

---

## Projet

**ATHELIA_CONGES** — Application desktop de gestion des congés pour **La Ciotat Entreprendre**.
- Auteur/client : Excellium
- Stack : **Electron 40.6.1** + **SQLite3** + HTML/CSS/JS vanilla
- Entry point : `src/main.js`
- Démarrage : `npm start` (electron-forge)

---

## Structure des fichiers clés

```
src/
├── main.js              # Processus principal Electron (~170 lignes) — setup, DB, migrations, fenêtre
├── preload.js           # Bridge contextIsolation — expose window.api au renderer (~230 lignes)
├── handlers/            # Modules IPC (12 fichiers)
│   ├── auth.js
│   ├── salaries.js
│   ├── soldes.js
│   ├── absences.js
│   ├── heures-sup.js
│   ├── traitements.js       # Traitements CP (mensuel + annuel) et RTT
│   ├── config-app.js        # CRUD paramètres globaux (taux CP)
│   ├── utils-cp.js          # Fonctions partagées calcul CP (calculerCPMensuel, etc.)
│   ├── notifications.js
│   ├── jours-feries.js
│   ├── rtt.js
│   ├── calcul.js
│   ├── pdf.js
│   └── navigation.js
├── assets/              # Logo, favicon, icônes
├── pages/
│   ├── login.html
│   ├── dashboard-user.html
│   └── dashboard-admin.html
├── js/
│   ├── dashboard-user.js    # Logique UI utilisateur (~720 lignes)
│   ├── dashboard-admin.js   # Logique UI admin (~2800 lignes)
│   └── chart.umd.js        # Chart.js (local)
└── css/
    ├── common.css           # Variables CSS globales + styles partagés
    ├── dashboard-user.css   # Styles page user
    └── dashboard-admin.css  # Styles page admin (~3050 lignes)

database/
└── conges.db            # Template SQLite (gitignore: *.db)
                         # DB active → AppData/Roaming/conges-lce/conges.db

DOCS/
├── TODO.md              # Tâches en cours et roadmap (gitignore)
└── DEVELOPPEURS.md      # Guide développeur complet
```

---

## Architecture IPC (pattern Electron)

```
Renderer (HTML/JS)          Preload (preload.js)        Main process (main.js)
window.api.getSoldes()  →   ipcRenderer.invoke()    →   ipcMain.handle('getSoldes')
                        ←   Promise resolved        ←   db.all() / db.run()
```

- **contextIsolation: true**, nodeIntegration: false
- Handlers IPC découpés en 12 modules dans `src/handlers/` — pattern : `module.exports = function(ctx, safeHandle)`
- `safeHandle(channel, handler)` : wrapper try/catch centralisé + logging `[IPC ERROR]`
- Toutes exposées via `contextBridge.exposeInMainWorld('api', {...})` dans `preload.js`
- La DB est **copiée depuis `database/conges.db` (template) vers le dossier configuré** (SharePoint/OneDrive ou AppData)

---

## Base de données SQLite

```sql
salaries     (id, nom, prenom, email, date_embauche, cp_mensuel, a_droit_rtt,
              a_droit_recup, en_arret_maladie, date_arret_maladie, actif, role,
              premiere_connexion)
              -- role: 'admin' | 'utilisateur'
              -- cp_mensuel: obsolète (mis à 0), remplacé par taux globaux
              -- en_arret_maladie: 0|1, date_arret_maladie: date ISO

soldes       (id, salarie_id, annee, cp_n1, cp_n, rtt, recup_heures)

absences     (id, salarie_id, type, date_debut, date_fin, duree_jours,
              duree_heures, commentaire, statut, date_creation,
              debut_periode, fin_periode)
              -- type: 'CP' | 'RTT' | 'RECUP' | 'MALADIE'
              -- debut_periode/fin_periode: 'journee-complete' | 'midi' | 'apres-midi'

jours_feries (id, date, libelle, annee)

config_app            (id, cle, valeur)
                      -- taux_cp_normal (défaut 2.08333), taux_cp_arret (défaut 1.66333)
historique_taux       (id, salarie_id, date_effet, ancien_taux, nouveau_taux)
                      -- Trace les passages normal↔arret avec date d'effet
config_traitements    (id, type, jour, mois)
historique_traitements(id, type, annee, date_execution, nb_salaries_traites, statut)
notifications         (id, user_id, type, titre, message, date_creation, lue)
rtt_annuels           (id, annee_debut, nb_jours_travailles, nb_cp_a_deduire,
                       nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt)
heures_supplementaires(id, salarie_id, date, heures, commentaire, date_creation)
```

---

## Règles métier

| Règle | Valeur |
|---|---|
| 1 jour ouvré | = 7 heures |
| Taux CP normal | 2.08333 j/mois (configurable dans Paramètres, table `config_app`) |
| Taux CP arrêt maladie | 1.66333 j/mois (configurable dans Paramètres, table `config_app`) |
| Calcul CP mensuel | Pro-rata en **jours ouvrés** (lun-ven hors fériés), segments par taux si changement mid-mois |
| Traitement CP mensuel | Auto le 1er de chaque mois, calcule le mois précédent → ajoute à `cp_n` |
| Traitement CP annuel | Transfert N→N-1 (cp_n ajouté à cp_n1, cp_n remis à 0) |
| Période CP | N-1 (1 juin → 31 mai) → alimente `cp_n1` ; N = en cours |
| RTT | annuel, calculé par traitement auto |
| RECUP | en **heures** dans la DB (`duree_heures`), converti en jours pour affichage |
| MALADIE | ne débite aucun solde, géré via case à cocher dans la fiche salarié |
| Solde négatif | autorisé techniquement, à contrôler côté UI |

---

## Handlers IPC (dans `src/handlers/`)

**Auth** (`auth.js`) : `login`, `logout`, `checkFirstLogin`, `setPassword`, `resetPassword`
**Salariés** (`salaries.js`) : `getSalarie`, `getAllSalaries`, `createSalarie`, `updateSalarie`, `deactivateSalarie`
**Soldes** (`soldes.js`) : `getSoldes`, `updateSoldes`, `updateSoldesAfterAbsence`
**Absences** (`absences.js`) : `createAbsence`, `getAbsences`, `getAllAbsences`, `deleteAbsence`, `updateAbsence`
**Heures sup** (`heures-sup.js`) : `ajouter-recup`, `getHeuresSup`
**Jours fériés** (`jours-feries.js`) : `getJoursFeries`, `addJourFerie`, `deleteJourFerie`
**RTT** (`rtt.js`) : `getRTTAnnuels`, `addRTTAnnuel`
**Traitements** (`traitements.js`) : `executerTraitementCP`, `executerTraitementCPMensuel`, `executerTraitementRTT`, `getConfigTraitements`, `updateConfigTraitement`, `getHistoriqueTraitements`, `logHistoriqueTraitement`
**Config** (`config-app.js`) : `getConfigApp`, `updateConfigApp`, `getHistoriqueTaux`
**Notifications** (`notifications.js`) : `getNotificationsNonLues`, `marquerNotificationLue`, `creerNotification`
**Calcul** (`calcul.js`) : `calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode)`
**PDF** (`pdf.js`) : `genererPDF`, `exporterRecapPDF`
**Navigation** (`navigation.js`) : `navigateTo`
**Utilitaires** (`utils-cp.js`) : `calculerCPMensuel`, `getTauxGlobaux`, `getJoursFeriesAnnee` (non IPC, utilisé par traitements.js et salaries.js)

---

## Design system CSS

```css
/* Variables dans common.css */
--bleu:   rgb(0, 108, 137)
--mauve:  rgb(116, 43, 135)
--rouge:  rgb(181, 22, 63)
--orange: rgb(237, 113, 17)
--jaune:  rgb(249, 198, 73)

/* Soldes compacts (layout 2×2) — couleur par état */
Positif  → fond/bordure/texte --bleu
Zéro     → fond/bordure/texte --orange
Négatif  → fond/bordure/texte --rouge
Sans droit → grisé, cursor: not-allowed

/* Layout "Mes Congés" (user + admin) */
.dashboard-content-new { display: grid; grid-template-columns: 360px 1fr; }
User  : height: calc(100vh - 80px)   /* header seul */
Admin : height: calc(100vh - 160px)  /* header + nav + padding */
```

---

## Easter eggs admin

| Raccourci | Action |
|---|---|
| `Ctrl+D+E+B+U+G` | Éditeur de soldes (modification directe CP/RTT/Récup par salarié) |
| `Ctrl+L+O+A+D` | Modale import Excel |
| `Ctrl+S+A+V+E` | Export Excel complet |

---

## État actuel du projet (08/03/2026)

**Fonctionnel** : authentification, CRUD salariés, pose d'absences (CP/RTT/RECUP), calendrier annuel + global, soldes compacts avec couleurs contextuelles, traitements automatiques CP mensuel + CP annuel + RTT, export PDF (congés + récap salarié), notifications DB + toasts, jours fériés (auto-génération), heures supplémentaires, import/export Excel, statistiques (Chart.js), dark mode complet, DB réseau (SharePoint/OneDrive), drag-to-select calendrier, demi-journées (AM/PM).

**Onglet Paramètres** (admin) : regroupe les taux CP globaux, les dates de traitement (CP annuel + RTT), le calcul RTT, et l'historique des traitements.

**Manquant / en cours** : voir `DOCS/TODO.md`

---

## Conventions de code

- Pas de framework JS — vanilla ES6+ avec `async/await`
- Requêtes DB via callbacks SQLite3 wrappés en `Promise` dans les handlers `src/handlers/`
- CSS scopé par section (`#mes-conges-section .ma-classe`) pour éviter les conflits admin/user
- Les commentaires de section CSS suivent le pattern `/* ========== TITRE ========== */`
- `bcrypt` : 10 rounds pour le hachage des mots de passe
- Fenêtre Electron : démarrage en `maximize()`, `minWidth: 900`, `minHeight: 600`
- Migrations DB versionnées : tableau `MIGRATIONS[]` dans `main.js`, table `db_version`
- Mode WAL + verrou `.lock` pour accès réseau concurrent
