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
├── main.js              # Processus principal Electron — tous les handlers IPC (~1530 lignes)
├── preload.js           # Bridge contextIsolation — expose window.api au renderer
├── assets/              # Logo, favicon
├── pages/
│   ├── login.html
│   ├── dashboard-user.html
│   └── dashboard-admin.html
├── js/
│   ├── dashboard-user.js    # Logique UI utilisateur (~720 lignes)
│   └── dashboard-admin.js   # Logique UI admin (~2740 lignes)
└── css/
    ├── common.css           # Variables CSS globales + styles partagés
    ├── dashboard-user.css   # Styles page user
    └── dashboard-admin.css  # Styles page admin (~2900 lignes)

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
- Toutes les fonctions DB passent par `ipcMain.handle` dans `main.js`
- Toutes exposées via `contextBridge.exposeInMainWorld('api', {...})` dans `preload.js`
- La DB est **copiée depuis `src/conges.db` (template) vers AppData** à la première installation

---

## Base de données SQLite

```sql
salaries     (id, nom, prenom, email, date_embauche, cp_mensuel, a_droit_rtt,
              a_droit_recup, actif, role)             -- role: 'admin' | 'user'

soldes       (id, salarie_id, annee, cp_n1, cp_n, rtt, recup_heures)

absences     (id, salarie_id, type, date_debut, date_fin, duree_jours,
              duree_heures, commentaire, statut)
              -- type: 'CP' | 'RTT' | 'RECUP' | 'MALADIE'

jours_feries (id, date, libelle, annee)

config_traitements    (id, type, jour, mois)
historique_traitements(id, type, annee, date_execution, nb_salaries_traites, statut)
notifications         (id, user_id, type, titre, message, date_creation, lue)
rtt_annuels           (id, annee_debut, nb_jours_travailles, nb_cp_a_deduire)
                      -- ⚠️ À VÉRIFIER : table peut-être absente du template DB
```

---

## Règles métier

| Règle | Valeur |
|---|---|
| 1 jour ouvré | = 7 heures |
| CP mensuel | défini par salarié (`cp_mensuel` dans `salaries`) |
| Période CP | N-1 (1 juin → 31 mai) → alimente `cp_n1` ; N = en cours |
| RTT | annuel, calculé par traitement auto |
| RECUP | en **heures** dans la DB (`duree_heures`), converti en jours pour affichage |
| MALADIE | ne débite aucun solde |
| Solde négatif | autorisé techniquement, à contrôler côté UI |

---

## Handlers IPC dans main.js (tous présents)

**Auth** : `login`, `logout`, `checkFirstLogin`, `setPassword`, `resetPassword`
**Salariés** : `getSalarie`, `getAllSalaries`, `createSalarie`, `updateSalarie`, `deactivateSalarie`
**Soldes** : `getSoldes`, `updateSoldes`, `updateSoldesAfterAbsence`
**Absences** : `createAbsence`, `getAbsences`, `getAllAbsences`, `deleteAbsence`, `updateAbsence`
**Jours fériés** : `getJoursFeries`, `addJourFerie`
**RTT** : `getRTTAnnuels`, `addRTTAnnuel`
**Traitements** : `executerTraitementCP`, `executerTraitementRTT`, `getConfigTraitements`, `updateConfigTraitement`, `getHistoriqueTraitements`
**Notifications** : `getNotificationsNonLues`, `marquerNotificationLue`, `creerNotification`
**Divers** : `calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode)`, `genererPDF`, `navigateTo`

---

## Design system CSS

```css
/* Variables dans common.css */
--bleu:   rgb(0, 108, 137)
--mauve:  rgb(116, 43, 135)
--rouge:  rgb(181, 22, 63)
--orange: rgb(237, 113, 17)
--jaune:  rgb(249, 198, 73)

/* Soldes compacts (layout 2×2) */
CP N-1 / CP N → fond/bordure bleu
RTT           → fond/bordure mauve
Récup         → fond/bordure rouge
Sans droit    → opacity: 0.4, cursor: not-allowed

/* Layout "Mes Congés" (user + admin) */
.dashboard-content-new { display: grid; grid-template-columns: 360px 1fr; }
User  : height: calc(100vh - 80px)   /* header seul */
Admin : height: calc(100vh - 160px)  /* header + nav + padding */
```

---

## Easter eggs admin

| Raccourci | Action |
|---|---|
| `Ctrl+D+E+B+U+G` | Modale test traitements automatiques |
| `Ctrl+L+O+A+D` | Modale import Excel |
| `Ctrl+S+A+V+E` | Export Excel complet |

---

## État actuel du projet (03/03/2026)

**Fonctionnel** : authentification, CRUD salariés, pose d'absences (CP/RTT/MALADIE), calendrier annuel, soldes compacts, traitements automatiques CP+RTT, export PDF, notifications DB, jours fériés.

**Manquant / en cours** : voir `DOCS/TODO.md`
Priorité haute : modal heures supplémentaires (bouton présent, handler IPC absent), vérification table `rtt_annuels` en DB, UI notifications.

---

## Conventions de code

- Pas de framework JS — vanilla ES6+ avec `async/await`
- Toutes les requêtes DB dans `main.js` via callbacks SQLite3 wrappés en `Promise`
- CSS scopé par section (`#mes-conges-section .ma-classe`) pour éviter les conflits admin/user
- Les commentaires de section CSS suivent le pattern `/* ========== TITRE ========== */`
- `bcrypt` : 10 rounds pour le hachage des mots de passe
- Fenêtre Electron : démarrage en `maximize()`, pas de `minWidth`/`minHeight` défini (TODO)
