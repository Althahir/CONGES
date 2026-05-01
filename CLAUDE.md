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
├── handlers/            # Modules IPC (13 fichiers + utils)
│   ├── auth.js
│   ├── salaries.js
│   ├── soldes.js
│   ├── absences.js          # Workflow validation (validerAbsence, refuserAbsence, etc.)
│   ├── heures-sup.js
│   ├── traitements.js       # Traitements CP (mensuel + annuel) et RTT
│   ├── config-app.js        # CRUD paramètres globaux (taux CP)
│   ├── utils-cp.js          # Fonctions partagées calcul CP (calculerCPMensuel, etc.)
│   ├── notifications.js
│   ├── jours-feries.js
│   ├── rtt.js
│   ├── calcul.js
│   ├── pdf.js
│   ├── navigation.js
│   └── db-admin.js          # Easter egg Ctrl+DEBUG (DB Browser, SQL libre)
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
├── DEVELOPPEURS.md      # Guide développeur complet
└── conges.db            # DB locale SQLite pour le dev (gitignored, copie de Turso)

scripts/
├── build-install-guide.py        # Génère le DOCX d'installation
└── dump-turso-to-local.js        # Copie Turso → DOCS/conges.db (pour dev)
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
              debut_periode, fin_periode,
              motif_refus, date_validation, validee_par,
              debite_cp_n1, debite_cp_n)
              -- type: 'CP' | 'RTT' | 'RECUP' | 'MALADIE'
              -- statut: 'valide' | 'en_attente' | 'refuse' (workflow validation)
              -- debut_periode/fin_periode: 'journee-complete' | 'midi' | 'apres-midi'
              -- validee_par: id admin ayant traité la demande
              -- debite_cp_n1/cp_n: répartition exacte du débit pour rollback fidèle à la suppression

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
heures_supplementaires(id, salarie_id, date, heures, commentaire, date_creation, source)
                      -- heures: peut être négatif (retrait/récupération) ou positif (crédit)
                      -- source: 'manuel' (saisie modale) | 'import_excel' (import des onglets RECUP <Nom>)
db_version            (version) -- actuellement v7
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
**Absences** (`absences.js`) : `createAbsence`, `getAbsences`, `getAllAbsences`, `deleteAbsence`, `updateAbsence`, `validerAbsence`, `refuserAbsence`, `getAbsencesEnAttente`, `getEnAttenteParSalarie`
**Heures sup** (`heures-sup.js`) : `ajouter-recup`, `getHeuresSup`, `updateHeureSup`, `deleteHeureSup`, `getHistoriqueRecupComplet` (union heures_supplementaires + absences RECUP pour la modale « Heures de récup »)
**Jours fériés** (`jours-feries.js`) : `getJoursFeries`, `addJourFerie`, `deleteJourFerie`
**RTT** (`rtt.js`) : `getRTTAnnuels`, `addRTTAnnuel`
**Traitements** (`traitements.js`) : `executerTraitementCP`, `executerTraitementCPMensuel`, `executerTraitementRTT`, `getConfigTraitements`, `updateConfigTraitement`, `getHistoriqueTraitements`, `logHistoriqueTraitement`
**Config** (`config-app.js`) : `getConfigApp`, `updateConfigApp`, `getHistoriqueTaux`
**Notifications** (`notifications.js`) : `getNotificationsNonLues`, `marquerNotificationLue`, `creerNotification`
**Calcul** (`calcul.js`) : `calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode)`
**PDF** (`pdf.js`) : `genererPDF`, `exporterRecapPDF`, `exporterStatsPDF`
**Navigation** (`navigation.js`) : `navigateTo`
**DB Admin** (`db-admin.js`) : `db-list-tables`, `db-get-table`, `db-update-cell`, `db-delete-row`, `db-insert-row`, `db-exec-raw` (easter egg `Ctrl+DEBUG`, accès admin sans sécurité applicative)
**App / Mises à jour** (dans `main.js` directement) : `getAppVersion`, `getIsDev` (true si `app.isPackaged === false`), `applyUpdate` (déclenche `autoUpdater.quitAndInstall`)
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
| `Ctrl+D+E+B+U+G` | **DB Browser** — visualisation et édition de toutes les tables (modification de cellule par double-clic, ajout/suppression de ligne, SQL libre) |
| `Ctrl+L+O+A+D` | Modale import Excel |
| `Ctrl+S+A+V+E` | Export Excel complet |

---

## État actuel du projet (XX/05/2026 — v1.1.0 en cours, v1.0.6 buildée mais pas publiée)

**Fonctionnel** : authentification, CRUD salariés, pose d'absences (CP/RTT/RECUP), calendrier annuel + global, soldes compacts avec couleurs contextuelles + ligne « en attente », traitements automatiques CP mensuel + CP annuel + RTT, export PDF (congés + récap salarié + stats), notifications DB + toasts (auto-dismiss côté user 5s, côté admin sur demande), jours fériés (auto-génération), heures supplémentaires, import/export Excel, statistiques (Chart.js), dark mode complet, drag-to-select calendrier, demi-journées (AM/PM).

**Workflow de validation des congés** (depuis 17/04/2026) : le salarié pose une demande qui passe en `en_attente`, l'admin la valide ou la refuse depuis un bandeau dédié dans la section « Validation » (ex-« Historique »). Solde débité uniquement à la validation, PDF officiel généré à ce moment. Notifications ciblées par user. La pose admin pour soi-même reste auto-validée (`autoValide: true`).

**DB Browser** (depuis 17/04/2026) : easter egg `Ctrl+DEBUG` refondu — accès lecture/écriture à toutes les tables Turso (édition cellule par double-clic, ajout/suppression de ligne, SQL libre).

**Onglet Paramètres** (admin) : regroupe les taux CP globaux, les dates de traitement (CP annuel + RTT), le calcul RTT, et l'historique des traitements.

**Migration Turso** (31/03/2026) : DB cloud libSQL, plus de fichier local ni de synchronisation OneDrive. Config Turso (URL + token) dans `config.json` (AppData/conges-lce/).

**Production** : v1.0.0 taggée et pushée le 25/04/2026. Installeur disponible : `out/make/squirrel.windows/x64/Gestion des Congés-X.X.X Setup.exe`. Guide d'installation : `DOCS/Guide_Installation_Conges_LCE.docx` (généré par `scripts/build-install-guide.py`).

**Auto-update** (depuis 25/04/2026) : la lib `update-electron-app` (config dans `main.js`) check `update.electronjs.org/Althahir/CONGES` toutes les heures, télécharge la maj en background, puis le renderer affiche un toast custom « Mise à jour disponible — Redémarrer » (sans croix de fermeture, l'utilisateur clique quand il est prêt). Bandeau « Version installée » dans la section Paramètres admin pour validation visuelle. Procédure de release : bump `package.json` → `npm run make` → uploader les 3 fichiers de `out/make/squirrel.windows/x64/` (Setup.exe, .nupkg, RELEASES) sur une nouvelle GitHub Release. Pré-requis : repo GitHub public.

**Modale « Heures de récup »** (depuis 26/04/2026 — v1.0.4) : nouveau bouton mauve « Heures de récup » dans la section Validation, à côté de « Arrêt maladie », visible si `a_droit_recup === 1`. Affiche un tableau unifié des 3 sources de saisies récupération : crédits/retraits manuels (modale Heures sup), imports Excel, et absences RECUP du calendrier. Filtres par année + mois (contextuels), colonne « Saisie le » avec badges colorés selon la source : `(import excel)` mauve, `(congé posé)` orange (lecture seule, boutons grisés + tooltip explicative pointant vers le calendrier historique). Édition inline pour les saisies natives (date, heures, commentaire) avec ajustement automatique du solde — gère le changement d'année. Suppression avec modale de confirmation jolie (bandeau orange si solde devient négatif). Notifs ciblées au salarié à chaque modif/suppression. Lignes négatives (jours posés) en rouge avec fond léger.

**Modale « Ajouter heures sup »** (depuis 26/04/2026 — v1.0.4) : refonte avec un toggle clair en haut du formulaire — boutons « Heures sup. faites à déclarer » (bleu, crédit) ou « Récupération d'heures » (rouge, retrait). L'utilisateur saisit toujours un nombre positif, le code applique automatiquement le bon signe avant l'envoi à `ajouter-recup`. Année déduite de la date (et non plus `anneeActuelle`) pour cohérence avec l'imputation par année.

**Import Excel — onglets RECUP** (depuis 26/04/2026 — v1.0.4) : `Ctrl+L+O+A+D` lit en plus tous les onglets dont le nom commence par `RECUP `. Chaque ligne `H.SUP` est importée comme crédit positif, chaque ligne `RECUP` horaire (genre RDV médical) comme retrait négatif. Les `RECUP` marquées « 1 journée(s) » sont **automatiquement ignorées** car elles correspondent à des absences déjà importées via l'onglet `Archives` (sinon double comptage). Détection de doublons par `(salarie_id, date, heures, commentaire)`. Salariés inconnus listés dans le rapport. Robustesse dates : conversion via `XLSX.SSF.parse_date_code()` sur les serials Excel pour éviter les bugs DST de `cellDates: true`, parser FR/US automatique pour les cellules texte.

**Migration v7** (depuis 26/04/2026) : ajout colonne `source` à `heures_supplementaires` ('manuel' / 'import_excel') pour tracer l'origine de chaque saisie et afficher le badge correspondant dans la modale.

**Migration v8** (v1.1.0) : ajout colonnes `statut` (`'valide' | 'en_attente' | 'refuse'`, default 'valide'), `date_validation`, `validee_par` à `heures_supplementaires`. Backfill `statut = 'valide'` pour les saisies existantes. Index `idx_heures_sup_statut`.

**v1.0.6 (27/04/2026) — PDF OneDrive auto + modale Heures sup unifiée + bascule dev/prod** :
- **PDF de validation/annulation** (`genererPDF`) refondu avec 3 modes :
  - `'auto'` (validation user par admin + suppression avec checkbox cochée) → enregistrement automatique dans `%OneDriveCommercial%\LA CIOTAT ENTREPRENDRE - DONNEES\17 DOSSIERS SALARIES\CONGES\PDF\`. Fallback `showSaveDialog`. Mention « Validé par : Prénom NOM, Secrétaire Général le JJ MMM AAAA » remplace le bloc signature.
  - `'print'` (pose admin pour soi-même) → impression directe sur l'imprimante par défaut Windows via `BrowserWindow` cachée + `webContents.print({silent:true})`. Fallback `showSaveDialog` si pas d'imprimante.
  - `'dialog'` (autres exports) → `showSaveDialog` simple.
- **PDF d'annulation** : titre rouge « ANNULATION DE CONGÉS », mention « Annulé par : ... », option déclenchée par checkbox dans la modale de suppression d'absence.
- **Convention de nommage** : `NOM_Prenom_TYPE_Du_dateDebut_Au_dateFin.pdf` (préfixe `ANNULATION_` pour les annulations). Type toujours `CP` (jamais `CP_N`/`CP_N1`).
- **Date du jour** ajoutée à l'en-tête : « La Ciotat Entreprendre · Le JJ Mmmmmm AAAA ».
- **Fonction « Secrétaire Général »** hardcodée (pas de migration v8). Les autres exports `exporterRecapPDF` et `exporterStatsPDF` ne sont **pas** sur OneDrive auto — juste `showSaveDialog`.

**Modale « Heures sup » unifiée** (v1.0.6) :
- **User et admin (section Mes Congés)** : un seul bouton « Heures sup » (icône horloge) → ouvre une modale de choix bleue avec 2 tuiles : « Mes saisies » / « Nouvelle saisie ».
- **Section Validation admin** : bouton « Heures de récup » (du salarié sélectionné) inchangé — autre rôle.
- **Édition/suppression côté user** : crayon ✏️ et poubelle 🗑️ activés uniquement pour les saisies manuelles positives. Imports Excel et lignes négatives (poses) → boutons grisés avec tooltip « non modifiable ». Édition inline + `confirm()` natif pour la suppression. Refresh tableau + `loadSoldes()` après chaque modif.
- **Modale historique côté user** : tableau scrollable (`max-height: 85vh`), header bleu, max-width 900px, filtres année/mois contextuels.
- **Côté admin (depuis Mes Congés)** : la fonction `ouvrirHistoriqueRecupAdminSelf()` réutilise la modale existante en sauvegardant/restaurant `salarieHistoriqueSelectionne` au close (contexte temporaire = `user.id`).

**Bascule dev/prod** (v1.0.6) :
- `getTursoConfig` détecte `app.isPackaged` :
  - **Dev** (`npm start`) → `file:DOCS/conges.db` via `@libsql/client` (pas de token)
  - **Prod** (installeur Squirrel) → Turso cloud via `config.json` (comportement inchangé)
- Script `scripts/dump-turso-to-local.js` : copie Turso → `DOCS/conges.db` avec backup auto, désactivation FK pendant l'import (Turso ne vérifie pas les FK, SQLite local oui), vérification d'intégrité finale via `PRAGMA foreign_key_check`.
- ⚠️ **`DOCS/conges.db` est dans le `.gitignore`** (ainsi que `*.db.bak`, `*.db-journal`) — JAMAIS la commiter, contient les vraies données prod copiées.
- Badge **DEV** rouge dans le header (3 pages) visible uniquement quand `app.isPackaged === false`. Handler IPC `getIsDev` exposé via `window.api.getIsDev()`.

**v1.0.7 (01/05/2026) — Correctifs au 1er traitement CP mensuel automatique** :

- **Bug solde arrêt maladie** détecté en dev lors du traitement d'avril 2026 : Emilie REDOUTE, marquée `en_arret_maladie = 1` depuis 2025-08-26, a reçu 2.08333 (taux normal) au lieu de 1.66333 (taux arrêt). Cause : `historique_taux` est vide pour elle — `calculerCPMensuel` ne lit que cette table, jamais la fiche `salaries`. Probable contournement du handler `updateSalarie` (DB Browser SQL libre, ou état pré-migration v2 jamais backfillé).
  - **Fix code** dans `utils-cp.js` (`calculerCPMensuel`) : filet de sécurité — si aucune entrée `historique_taux` avant le mois traité ET fiche `en_arret_maladie = 1` avec `date_arret_maladie` antérieure au début du mois, on démarre le mois au taux arrêt. L'historique reste prioritaire s'il a au moins une entrée. Couvre les imports / bascules manuelles qui auraient sauté l'INSERT historique.
  - **Correctif data prod Turso** à appliquer manuellement (voir 🚨 PRIORITÉ dans `DOCS/TODO.md`) : backfill `historique_taux` pour tous les salariés en arrêt sans entrée + rectification `cp_n` d'Emilie pour avril (-0.42 = 2.08333 - 1.66333).
  - **Règle pour le futur** : ne JAMAIS modifier `salaries.en_arret_maladie` directement en DB sans ajouter manuellement la ligne `historique_taux` correspondante. Toujours passer par la fiche UI (qui le fait automatiquement via `updateSalarie`).

- **Notifications de traitement automatique** : avant cette version, les versions `*Auto` (CP mensuel, CP annuel, RTT) envoyaient l'event `traitement-automatique` au front mais n'inséraient **pas** de notif persistante en DB. Conséquence : admin connecté à l'instant T voyait le toast live, admin reconnecté plus tard ne voyait ni toast ni badge cloche.
  - Helper `notifierAdminsTraitement(titre, message, statut)` ajouté dans `traitements.js` : insère une notif **ciblée par admin actif** (`user_id = admin.id`), pas de notif globale.
  - 6 fonctions de traitement (3 manuelles + 3 auto) refactorisées pour utiliser le helper.
  - Libellés CP mensuel : « Traitement CP mensuel (avril 2026) effectué » via constante `MOIS_NOMS` partagée (au lieu de `(mois 4)`).

- **Toast unique au démarrage admin** (`afficherToastsAuDemarrage` dans `dashboard-admin.js`, appelée dans `init()` après `chargerNotificationsNonLues`) : pour les notifs `type === 'traitement'`, déduplication par groupe via préfixe de titre (`^Traitement CP mensuel`, `^Basculement CP`, `RTT Annuel|Traitement RTT`). Une seule notif gardée par groupe (la plus récente). Les autres notifs (workflow `demande_*`, alertes RTT manquant, etc.) restent toutes affichées. Cas d'usage : admin qui ne s'est pas connecté pendant 5 mois → 1 seul toast CP mensuel (le plus récent) + tous les toasts de demandes en attente. Les 4 plus anciennes notifs CP mensuel restent dans la cloche pour consultation.

- **Tuile « Taux d'acquisition CP »** (Paramètres) : ajout d'un bandeau `.config-historique` en bas avec span `#cpMensuelDernierTraitement`. `chargerHistoriqueTraitements` cherche le dernier `historique_traitements` dont `type LIKE 'CP_MENSUEL_%'` et affiche `JJ/MM/AAAA (mois YYYY) - X salarié(s) - <badge statut>`. Format identique aux 2 autres tuiles « Basculement annuel CP » et « Traitement annuel RTT ».

- **Login — Entrée déclenche la connexion** : listener `keydown` global dans `login.js`. Si focus hors form/input/select/button, déclenche `form.requestSubmit()`. Couvre le cas du pré-remplissage automatique (email mémorisé + mot de passe via `saveCredential`) où le focus reste sur `<body>`.

- **Toast — refonte visuelle** : fond blanc (`#fff` clair / `--bg-surface` dark) + bordure 1.5px colorée transparente (rgba 0.45) + accent gauche 4px plein + **« boudin »** via `box-shadow: 0 0 0 10px rgba(...)` (opacité 0.35 light / 0.40 dark) qui crée un halo coloré autour du toast. Trois variants : `.success` (vert #28a745), `.error` (rouge #dc3545), `.partial` (orange `var(--orange)`, nouveau — utilisé pour `statut === 'partial'` ou `'info'`). Le mapping côté `afficherToastsAuDemarrage` distingue `error` / `partial` / `info` / défaut `success`.

- **Toast — son zen** (`src/js/toast-sound.js`, nouveau) : exposé via `window.jouerSonToast()`. Génération à la volée par Web Audio API, pas d'asset à embarquer. **2 sinusoïdes** (Ré 6 = 1175 Hz + La 6 = 1760 Hz décalée 200 ms) → motif mélodique de quinte juste, ambiance « clochette tibétaine ». **Filtre lowpass à 800 Hz** (Q = 0.7) pour effet feutré « derrière un oreiller » qui adoucit fortement les aigus. Durée totale 1s, attaques douces 60-80 ms, fade-out exponentiel. Volumes 0.035 / 0.025. Inclus via `<script>` dans `dashboard-admin.html` et `dashboard-user.html`, appelé dans `_rendreToast` (admin) et `_afficherProchainToastUser` (user). Try/catch silencieux si autoplay bloqué.

- **Toast — un son par rafale** : flag `playSon` calculé au moment du push (`!_toastActif && _toastQueue.length === 0`) et propagé via la file d'attente vers le rendu. Conséquence : si `afficherToastsAuDemarrage` enchaîne 3 toasts pour un admin qui se reconnecte, un seul « ding » est joué (le 1er) ; les rendus suivants sont silencieux. La règle s'applique aussi au polling 30s et aux events live qui arriveraient pendant qu'un toast est encore visible.

- **Section Paramètres — header flex** : titre `<h2>` et badge version `.param-card-version` regroupés dans un `<div class="parametres-header">` (flex `space-between`, `align-items: center`, `flex-wrap: wrap`). Suppression de `.param-version-wrapper` (n'a plus d'utilité). Le badge est désormais aligné à droite **sur la même ligne** que le titre.

- **Toast « Mise à jour disponible » — refonte** : bouton « Redémarrer » repensé avec dégradé **vert** (#28a745 → #34c759, en cohérence avec les notifs success), padding plus généreux (10/20), border-radius 8px, ombre portée qui se renforce au hover, **lift** `translateY(-1px)` et **icône qui tourne à 180°** (rotation 0.4s) au survol pour suggérer l'action de redémarrer. Effet d'enfoncement à l'`active`. Dark mode adapté avec dégradé vert clair (#5cbf7a → #7dd595). Le toast lui-même garde sa classe `.update-toast` qui surcharge `.notification-persistante.success` (z-index 10002, width 540px).

- **Toast Mise à jour — son d'annonce** : seconde fonction `window.jouerSonMaj()` ajoutée dans `toast-sound.js`. Variante du son zen avec **3 notes ascendantes** (Ré 6 → Fa# 6 → La 6 = accord parfait majeur, décalages 0 / 180 / 360 ms) pour annoncer une nouveauté de manière positive. Même filtre lowpass 800 Hz et même fade-out exponentiel que les notifs classiques, durée 1.6s (un peu plus longue pour signaler l'importance). Volumes décroissants 0.04 / 0.035 / 0.03. Appelée dans `afficherToastMaj` côté admin et user.

**v1.1.0 (en cours, mai 2026) — Workflow validation heures de récup + nouvelles règles métier + refonte UX** :

- **Workflow de validation pour les heures de récup** (aligné sur celui des congés). Les **retraits manuels** (récup posée par le user via la modale Heures sup) passent en `en_attente` ; les **crédits** (heures sup faites) sont validés immédiatement comme avant. Les imports Excel et l'`autoValide=true` (admin pour soi) court-circuitent. Solde n'est ajusté qu'à la validation. Optimistic locking via `UPDATE ... WHERE statut='en_attente'` (si rowsAffected = 0, abort sans débiter — résout la race condition admin valide / user supprime). DELETE atomique avec `RETURNING *` pour récupérer le statut au moment exact de la suppression.
  - Nouveaux handlers : `validerHeureSup` / `refuserHeureSup` / `getHeuresSupEnAttente` (heures-sup.js, exposés dans preload).
  - Bandeau Validation admin (section Historique) regroupe absences ET demandes de récup. Modale jolie `confirmModal` réutilisable au lieu de `confirm()` natif.
  - Panel "Mes demandes en cours" côté user inclut les heures sup en attente avec bouton corbeille pour annuler (notif live `demande_supprimee` envoyée aux admins).
  - Notif globale admins à la création (event live), notif ciblée user à validation/refus avec ID inclus dans l'event (permet marquage-comme-lu à la fermeture du toast).

- **Règles métier nouvelles** :
  - Plafond **2h30** sur les retraits via la modale Heures sup (live + submit + handler `ajouter-recup`).
  - Demi-journée **matin = 3h, après-midi = 4h** (au lieu de 3h30 chacune). `calcul.js` retourne `dureeHeures = joursOuvres × 7 − 3 (si début après-midi) − 4 (si fin midi)`. Multi-jours cohérent.
  - Formulaire de demande d'absence : option « En heures » retirée pour les RECUP. Les RECUP via formulaire d'absence sont uniquement journées et demi-journées. Pour des heures, l'utilisateur passe par la modale Heures sup.
  - Blocages sur les retraits Heures sup : week-end, jour férié, jour entièrement couvert par une absence (les demi-journées laissent place aux heures).
  - Bug `getEnAttenteParSalarie` : ne plus double-compter `duree_heures + duree_jours × 7` (faisait afficher 27h au lieu de 13h dans les soldes en attente).

- **Visuel des calendriers** :
  - **Demi-journées** sur les calendriers individuels : dégradé horizontal (matin = gauche, après-midi = droite). Variables CSS `--couleur-jour` et `--couleur-jour-pending` par type. Demi-journées validées : chiffre noir lisible sur la moitié transparente. Demi-journées en attente : couleur atténuée + outline dashed + couleurs claires en dark mode (`#5cbdd5`/`#c98edb`/`#e86880`/`#f0a050`).
  - **Heures de récup posées** sur les calendriers individuels : bordure dashed rouge + petit triangle rouge en haut-gauche (`.hsup-coin`) + badge `Xh` en bas à droite (`.hsup-badge`). En attente : couleurs atténuées. Si superposé à une demi-journée d'absence : on garde le dégradé d'absence + ajoute uniquement le badge (pas de bordure ni coin pour ne pas surcharger).
  - **Calendrier global** (admin + user) : indicateurs colonnes en dégradé vertical pour les demi-journées (matin = haut, après-midi = bas). Indicateurs en attente à `opacity: 0.4`. Tooltip discrète au survol (gris foncé semi-transparent, `font-size: 0.7em`).
  - **Calendrier Historique** (page Validation) : couleurs RECUP/MALADIE alignées sur le standard du projet (étaient inversées avant). Hover scale 1.2 étendu aux `.hsup-pose.en-attente`.
  - Tooltips concaténés au lieu d'écrasés quand absence + heures de récup le même jour. `\n` rendus en retours à la ligne (`white-space: pre`). Z-index 9000+ pour passer au-dessus du calendrier. `overflow: hidden` retiré des `td` pour permettre au tooltip de déborder.

- **Navigation et interactions** :
  - **Calendrier global** admin : clic sur indicateur en attente → bascule sur Validation + ouvre le calendrier individuel du salarié + scroll vers la card (param `skipScroll` pour garder le focus sur la card).
  - Calendriers individuels : clic sur jour avec demande en attente → scroll vers la card correspondante avec flash orange (pulsation 2s).
  - Toggles AM/PM du formulaire d'absence : reset auto à matin/après-midi à chaque changement de date (input ou drag-to-select).
  - Tooltip de cellule td filtrée pour ne pas lister les demandes en_attente (info redondante avec l'indicateur).

- **Modales et toasts** :
  - **`confirmModal()`** : nouvelle fonction réutilisable côté admin et user (style commun dans `common.css`). Crée à la volée une modale jolie avec titre + info + message + boutons. Remplace `confirm()` natif partout (validation/refus admin, annulation user, suppression saisie de récup user).
  - Modale Heures sup : titre + couleur du header s'adaptent au mode (crédit bleu / retrait rouge). Bouton Enregistrer reprend la couleur (`btn-primary` / `btn-primary.hsup-retrait`).
  - **Toast cliquable au démarrage admin** : « X demandes de validation en attente — Cliquez ici pour y accéder ». Tag `'demandes-pending'` permet de le fermer programmatiquement quand l'admin navigue manuellement vers la section Validation.
  - **Animation slide-out** sur fermeture des toasts (0.3s ease-in + classe `.dismissing`). Synchronisée avec le marquage en lu de la notif DB.
  - **Toasts admin** : son désactivé pour les actions admin contextuelles (validation/refus absence + récup) via le 7e param `silencieux`.
  - **Toasts user** : regroupement via debounce 500ms — si plusieurs validations/refus arrivent en rafale, un seul toast groupé apparaît avec tous les IDs. Marquage en lot des notifs DB à la fermeture.
  - `afficherNotificationPersistante` (admin) étendue : 8 paramètres dont `notificationId` (marque DB lue à la fermeture) et `tag` (fermeture programmatique).

- **Refresh automatique** des calendriers (user + admin) après chaque action heures sup (ajout / édition / suppression). Plus besoin de F5.

- **Notif DB ciblée** : pas créée si l'acteur de l'action est aussi le salarié concerné (param `actorId` dans `updateHeureSup`/`deleteHeureSup`). Évite les doublons toast direct + badge cloche.

- **Audit détaillé du traitement CP mensuel** (`utils-cp.js` + `traitements.js`) : nouvelle fonction `calculerCPMensuelDetail` qui retourne en plus du total les segments de calcul, jours ouvrés, taux utilisés, état du salarié. Le `details` JSON dans `historique_traitements` contient maintenant pour chaque salarié : `ancien_cp_n`, `cp_ajoutes` (number, pas string), `nouveau_cp_n`, et un objet `audit` complet. Permet de reconstituer ligne à ligne le calcul a posteriori (`Ctrl+DEBUG` → `historique_traitements` → filtrer `type LIKE 'CP_MENSUEL_%'`). Activé automatiquement à partir du 1er traitement post-déploiement (pas de migration nécessaire). Outil de diagnostic pour le sujet métier en cours : écart 22.88 dans l'app vs 22.92 sur le bulletin de paie.

- **Cosmétique** : tous les `.toFixed(1)` → `.toFixed(2)`, astérisques `*` retirés des labels obligatoires (15 labels dans les deux dashboards), placeholder « Ex: 1.5 » sur les inputs heures sup, croix de fermeture des modales avec style générique, page de connexion élargie à 420px, login Enter, etc.

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
