# CLAUDE.md — Contexte projet pour Claude Code

> Ce fichier est chargé automatiquement par Claude Code à chaque session.
> Il contient tout ce qu'il faut pour reprendre le projet sans re-briefing.

---

## Projet

**ATHELIA_CONGES** — Application desktop de gestion des congés pour **La Ciotat Entreprendre**.
- Auteur/client : Excellium
- Stack : **Electron 40.6.1** + **Turso** (libSQL cloud) + HTML/CSS/JS vanilla
- Entry point : `src/main.js`
- Démarrage : `npm start` (electron-forge)

---

## Structure des fichiers clés

```
src/
├── main.js              # Processus principal Electron — setup Turso, migrations, fenêtre
├── preload.js           # Bridge contextIsolation — expose window.api au renderer (~230 lignes)
├── handlers/            # Modules IPC (12 fichiers + utils)
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

DOCS/
├── TODO.md              # Tâches en cours et roadmap (gitignore)
└── DEVELOPPEURS.md      # Guide développeur complet
```

---

## Architecture IPC (pattern Electron)

```
Renderer (HTML/JS)          Preload (preload.js)        Main process (main.js)
window.api.getSoldes()  →   ipcRenderer.invoke()    →   ipcMain.handle('getSoldes')
                        ←   Promise resolved        ←   client.execute() (Turso)
```

- **contextIsolation: true**, nodeIntegration: false
- Handlers IPC découpés en 12 modules dans `src/handlers/` — pattern : `module.exports = function(ctx, safeHandle)`
- `safeHandle(channel, handler)` : wrapper try/catch centralisé + logging `[IPC ERROR]`
- Toutes exposées via `contextBridge.exposeInMainWorld('api', {...})` dans `preload.js`
- La DB est hébergée sur **Turso** (cloud libSQL) — `ctx.db` est un client `@libsql/client`
- Syntaxe DB : `await ctx.db.execute({ sql, args })` → `.rows` / `.rows[0]` / `.lastInsertRowid`

---

## Base de données Turso (libSQL cloud)

> **Migration terminée** (31/03/2026) depuis SQLite3 local/OneDrive vers Turso.
> Toutes les instances Electron se connectent à la même DB Turso — pas de fichier local, pas de synchronisation, pas de conflit.

**Connexion** : URL + token stockés dans `config.json` (AppData/conges-lce/)
```json
{
  "tursoUrl": "libsql://congeslce-xxx.turso.io",
  "tursoToken": "eyJ..."
}
```

**Attention SQL** : Turso respecte le standard SQL — utiliser des guillemets simples `'valeur'` pour les chaînes (pas des guillemets doubles `"valeur"` qui sont interprétés comme des identifiants de colonne).

```sql
salaries     (id, nom, prenom, email, mot_de_passe, role, date_embauche,
              type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, actif,
              premiere_connexion, date_creation, en_arret_maladie, date_arret_maladie)
              -- role: 'admin' | 'utilisateur'
              -- cp_mensuel: obsolète (mis à 0), remplacé par taux globaux
              -- en_arret_maladie: 0|1, date_arret_maladie: date ISO

soldes       (id, salarie_id, annee, cp_n, cp_n1, rtt, recup_heures, derniere_maj)

absences     (id, salarie_id, type, date_debut, date_fin, duree_jours,
              duree_heures, statut, commentaire, date_creation,
              debut_periode, fin_periode)
              -- type: 'CP' | 'RTT' | 'RECUP' | 'MALADIE'
              -- debut_periode/fin_periode: 'journee-complete' | 'midi' | 'apres-midi'

jours_feries (id, date, libelle, annee)

config_app            (cle, valeur)
                      -- taux_cp_normal (défaut 2.08333), taux_cp_arret (défaut 1.66333)
historique_taux       (id, salarie_id, date_effet, ancien_taux, nouveau_taux, date_creation)
                      -- Trace les passages normal↔arret avec date d'effet
config_traitements    (id, type, jour, mois, actif, derniere_maj)
historique_traitements(id, type, date_execution, annee, nb_salaries_traites, details, statut, message_erreur)
notifications         (id, type, titre, message, details, statut, date_creation, lue, user_id)
rtt_annuels           (id, annee_debut, date_debut, date_fin, nb_jours_periode, nb_jours_we,
                       nb_jours_feries_hors_we, nb_jours_travailles, nb_cp_a_deduire, nb_rtt, annee)
heures_supplementaires(id, salarie_id, date, heures, commentaire, date_creation)
db_version            (version) -- actuellement v5
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

**Auth** (`auth.js`) : `login`, `checkFirstLogin`, `setPassword`, `resetPassword`
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
**PDF** (`pdf.js`) : `genererPDF`, `exporterRecapPDF`, `exporterStatsPDF`
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

## État actuel du projet (31/03/2026)

**Fonctionnel** : authentification, CRUD salariés, pose d'absences (CP/RTT/RECUP), calendrier annuel + global, soldes compacts avec couleurs contextuelles, traitements automatiques CP mensuel + CP annuel + RTT, export PDF (congés + récap salarié + stats), notifications DB + toasts, jours fériés (auto-génération), heures supplémentaires, import/export Excel, statistiques (Chart.js), dark mode complet, drag-to-select calendrier, demi-journées (AM/PM).

**Onglet Paramètres** (admin) : regroupe les taux CP globaux, les dates de traitement (CP annuel + RTT), le calcul RTT, et l'historique des traitements.

**Migration Turso terminée** (31/03/2026) : DB cloud libSQL, plus de fichier local ni de synchronisation OneDrive. Supprimés : `withDatabase()`, locks fichier, backup local, `getDbFolder()`, template `conges.db`. Config Turso (URL + token) dans `config.json` (AppData).

**Manquant / en cours** : voir `DOCS/TODO.md`

---

## Conventions de code

- Pas de framework JS — vanilla ES6+ avec `async/await`
- Requêtes DB via `await ctx.db.execute({ sql, args })` — syntaxe Turso/libSQL (async natif)
- **Important** : utiliser des guillemets simples `'...'` pour les valeurs SQL (pas des guillemets doubles)
- CSS scopé par section (`#mes-conges-section .ma-classe`) pour éviter les conflits admin/user
- Les commentaires de section CSS suivent le pattern `/* ========== TITRE ========== */`
- `bcrypt` : 10 rounds pour le hachage des mots de passe
- Fenêtre Electron : démarrage en `maximize()`, `minWidth: 900`, `minHeight: 600`
- Migrations DB versionnées : tableau `MIGRATIONS[]` dans `main.js`, table `db_version`

---

## Déploiement multi-postes

```
Poste 1 (bureau)      ──┐
Poste 2 (bureau)      ──┤──► Turso DB (cloud, libSQL)
Poste 3 (télétravail) ──┘    libsql://congeslce-xxx.turso.io
```

- Chaque poste a besoin de : l'installeur `.exe` + `config.json` dans `%appdata%\conges-lce\`
- Build : `npm run make` → `out/make/squirrel.windows/x64/Gestion des Congés-1.0.0 Setup.exe`
- Pas de serveur intermédiaire, pas de VPN, connexion directe Electron → Turso (HTTPS)
