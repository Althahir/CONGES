# ATHELIA_CONGES — Guide développeur

> Application desktop de gestion des congés pour **La Ciotat Entreprendre**
> Développée par Excellium — v1.0.0

---

## Sommaire

1. [Prérequis & installation](#1-prérequis--installation)
2. [Architecture générale](#2-architecture-générale)
3. [Base de données](#3-base-de-données)
4. [Ajouter une fonctionnalité — flux IPC](#4-ajouter-une-fonctionnalité--flux-ipc)
5. [Règles métier](#5-règles-métier)
6. [Conventions CSS](#6-conventions-css)
7. [Fonctionnalités existantes](#7-fonctionnalités-existantes)
8. [Easter eggs admin](#8-easter-eggs-admin)
9. [Build & distribution](#9-build--distribution)
10. [Déploiement multi-utilisateurs](#10-déploiement-multi-utilisateurs)
11. [Roadmap](#11-roadmap)

---

## 1. Prérequis & installation

### Environnement requis

| Outil | Version minimale |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Electron | 40.6.1 (installé via npm) |
| SQLite Browser | Recommandé pour inspecter la DB |

### Installation

```bash
git clone <repo>
cd ATHELIA_CONGES
npm install
npm start
```

### Lancer en développement

```bash
npm start          # Electron + DevTools disponibles (F12)
```

### Packager l'application

```bash
npm run package    # Génère le binaire dans /out
npm run make       # Génère l'installeur (Squirrel sur Windows)
```

### Base de données

La DB est hébergée sur **Turso** (cloud). Pour le développement, configurer l'URL et le token dans `config.json` (AppData) ou utiliser une DB Turso de développement dédiée.
Pour réinitialiser la DB : recréer les tables via les migrations ou créer une nouvelle DB Turso.

---

## 2. Architecture générale

### Stack

```
┌─────────────────────────────────────────────────────┐
│                   Electron 40.6.1                   │
├──────────────────────┬──────────────────────────────┤
│   Main process       │   Renderer process           │
│   (src/main.js)      │   (pages/*.html + src/js/*.js│
│                      │                              │
│   - @libsql/client   │   - HTML/CSS/JS vanilla       │
│   - (Turso DB cloud) │   - Pas de framework          │
│   - bcrypt, pdfkit   │   - ES6+ async/await          │
│   - IPC handlers     │   - window.api (via preload)  │
├──────────────────────┴──────────────────────────────┤
│                   preload.js                        │
│   contextBridge → window.api = { ... }              │
└─────────────────────────────────────────────────────┘
```

### Flux de données

```
UI (dashboard-user.js)
  └─→ window.api.maFonction(params)          [renderer]
        └─→ ipcRenderer.invoke('maFonction') [preload.js]
              └─→ ipcMain.handle('maFonction') [main.js]
                    └─→ client.execute()       [Turso/libSQL]
                    └─→ resolve(data)
              ←── Promise<data>
        ←── data
  ←── data
```

### Structure des fichiers

```
ATHELIA_CONGES/
├── CLAUDE.md                    # Contexte IA (Claude Code)
├── DOCS/
│   ├── DEVELOPPEURS.md          # Ce fichier
│   └── TODO.md                  # Tâches privées (gitignore)
├── src/
│   ├── main.js                  # Process principal, ~1530 lignes
│   │                            # Contient TOUS les handlers IPC
│   ├── preload.js               # Bridge sécurisé renderer ↔ main
│   ├── conges.db                # Template DB (copié à l'install)
│   ├── assets/
│   │   ├── logo.png               # Logo page login
│   │   ├── logo.ico               # Icône app packagée (forge)
│   │   ├── favicon2.png           # Logo topbar admin + user
│   │   ├── favicon3.ico           # Icône fenêtre/taskbar + installateur
│   │   └── logo_horiz_fdBlanc.png # Logo page set-password
│   ├── pages/
│   │   ├── login.html
│   │   ├── dashboard-user.html  # Interface salarié
│   │   └── dashboard-admin.html # Interface administrateur
│   ├── js/
│   │   ├── dashboard-user.js    # ~720 lignes
│   │   └── dashboard-admin.js   # ~2740 lignes
│   └── css/
│       ├── common.css           # Variables + styles partagés
│       ├── dashboard-user.css   # Styles interface salarié
│       └── dashboard-admin.css  # Styles interface admin, ~2900 lignes
├── database/                    # Ignoré par git (contient *.db de dev)
├── package.json
└── .gitignore
```

---

## 3. Base de données

### Schéma complet

```sql
-- Salariés
CREATE TABLE salaries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    prenom        TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    date_embauche TEXT,
    cp_mensuel    REAL DEFAULT 2.08,   -- Jours CP acquis par mois
    a_droit_rtt   INTEGER DEFAULT 0,   -- Booléen 0/1
    a_droit_recup INTEGER DEFAULT 0,   -- Booléen 0/1
    actif         INTEGER DEFAULT 1,   -- Booléen 0/1
    role          TEXT DEFAULT 'user'  -- 'user' | 'admin'
);

-- Soldes par année
CREATE TABLE soldes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id  INTEGER REFERENCES salaries(id),
    annee       INTEGER NOT NULL,
    cp_n1       REAL DEFAULT 0,      -- CP période précédente (juin N-1 → mai N)
    cp_n        REAL DEFAULT 0,      -- CP période en cours
    rtt         REAL DEFAULT 0,      -- Jours RTT restants
    recup_heures REAL DEFAULT 0      -- Heures de récupération restantes
);

-- Absences (avec workflow validation depuis v3 + tracking décomposition CP depuis v6)
CREATE TABLE absences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id      INTEGER REFERENCES salaries(id),
    type            TEXT NOT NULL,      -- 'CP' | 'CP_N' | 'CP_N1' | 'RTT' | 'RECUP' | 'MALADIE'
    date_debut      DATE NOT NULL,      -- Format ISO YYYY-MM-DD
    date_fin        DATE NOT NULL,
    duree_jours     REAL DEFAULT 0,     -- En jours ouvrés
    duree_heures    REAL DEFAULT 0,     -- En heures (utilisé pour RECUP)
    commentaire     TEXT,
    statut          TEXT DEFAULT 'valide'
                    CHECK (statut IN ('valide', 'en_attente', 'refuse', 'supprime')),
    date_creation   DATETIME DEFAULT CURRENT_TIMESTAMP,
    debut_periode   TEXT DEFAULT 'journee-complete',
    fin_periode     TEXT DEFAULT 'journee-complete',
    motif_refus     TEXT,                -- Réservé (colonne conservée mais plus écrite depuis v1.0.0)
    date_validation TEXT,                -- Timestamp de validation/refus par admin
    validee_par     INTEGER,             -- ID de l'admin ayant traité
    debite_cp_n1    REAL DEFAULT 0,      -- Combien de jours débités sur cp_n1 (pour rollback fidèle)
    debite_cp_n     REAL DEFAULT 0       -- Combien de jours débités sur cp_n (pour rollback fidèle)
);

-- Jours fériés
CREATE TABLE jours_feries (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    date    TEXT NOT NULL,
    libelle TEXT NOT NULL,
    annee   INTEGER
);

-- Configuration des traitements automatiques
CREATE TABLE config_traitements (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  -- 'CP_ANNUEL' | 'RTT_ANNUEL'
    jour INTEGER,        -- Jour du mois (1-31)
    mois INTEGER         -- Mois (1-12)
);

-- Historique des traitements exécutés
CREATE TABLE historique_traitements (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    type                TEXT,
    annee               INTEGER,
    date_execution      TEXT,
    nb_salaries_traites INTEGER,
    statut              TEXT   -- 'success' | 'error'
);

-- Notifications
CREATE TABLE notifications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,   -- NULL = tous les admins
    type          TEXT,
    titre         TEXT,
    message       TEXT,
    date_creation TEXT,
    lue           INTEGER DEFAULT 0
);

-- Paramètres RTT par année (migration auto au démarrage)
CREATE TABLE rtt_annuels (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    annee_debut               INTEGER NOT NULL UNIQUE,
    date_debut                TEXT,             -- Début période (ex: 2026-06-01)
    date_fin                  TEXT,             -- Fin période (ex: 2027-05-31)
    nb_jours_periode          INTEGER,          -- Total jours dans la période
    nb_jours_we               INTEGER,          -- Jours de weekend
    nb_jours_feries_hors_we   INTEGER,          -- Fériés hors WE (depuis DB jours_feries)
    nb_jours_travailles       INTEGER,          -- Forfait jours (ex: 218)
    nb_cp_a_deduire           INTEGER DEFAULT 25,
    nb_rtt                    INTEGER           -- Résultat final du calcul
);

-- Configuration globale (taux CP)
CREATE TABLE config_app (
    cle    TEXT PRIMARY KEY,
    valeur TEXT
    -- Clés : 'taux_cp_normal' (défaut 2.08333), 'taux_cp_arret' (défaut 1.66333)
);

-- Trace des passages normal ↔ arrêt maladie (utilisé par calcul CP mensuel)
CREATE TABLE historique_taux (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id    INTEGER REFERENCES salaries(id),
    date_effet    DATE NOT NULL,
    ancien_taux   REAL,
    nouveau_taux  REAL,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Heures supplémentaires (séparée de absences pour ne pas polluer le calendrier)
CREATE TABLE heures_supplementaires (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id    INTEGER REFERENCES salaries(id),
    date          DATE NOT NULL,
    heures        REAL NOT NULL,
    commentaire   TEXT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrations DB versionnées
CREATE TABLE db_version (
    version INTEGER NOT NULL  -- actuellement v6
);
```

**Historique des migrations** (tableau `MIGRATIONS[]` dans `main.js`) :
- **v1** : schéma initial complet
- **v2** : config_app + historique_taux + colonnes en_arret_maladie / date_arret_maladie sur salaries
- **v3** : workflow validation — colonnes motif_refus / date_validation / validee_par sur absences, backfill statut → 'valide'
- **v4** : recréation table absences pour relâcher la contrainte CHECK statut (anciennement bloquait en_attente / refuse)
- **v5** : drop table historique_modifs (jamais utilisée)
- **v6** : colonnes debite_cp_n1 / debite_cp_n sur absences (rollback fidèle des soldes à la suppression)

### Accès à la DB en développement

1. Installer le CLI Turso : `curl -sSfL https://get.tur.so/install.sh | bash`
2. Se connecter : `turso auth login`
3. Ouvrir un shell SQL : `turso db shell conges` (remplacer par le nom de la DB)
4. Ou utiliser l'interface web Turso : https://turso.tech/app

---

## 4. Ajouter une fonctionnalité — flux IPC

### Exemple complet : ajouter un handler `monHandler`

**Étape 1 — handler dans `src/handlers/`** : créer ou compléter le module

```javascript
// Dans le module handler (reçoit ctx et safeHandle)
safeHandle('monHandler', async (event, param1, param2) => {
    const result = await ctx.db.execute({
        sql: 'SELECT * FROM ma_table WHERE id = ?',
        args: [param1]
    });
    return result.rows;
});
```

**Étape 2 — `preload.js`** : exposer la fonction

```javascript
// Dans contextBridge.exposeInMainWorld('api', { ... })
monHandler: (param1, param2) => ipcRenderer.invoke('monHandler', param1, param2),
```

**Étape 3 — JS renderer** : appeler depuis l'interface

```javascript
const data = await window.api.monHandler(param1, param2);
```

### Règles importantes

- Tous les handlers sont `async` — utiliser `await client.execute()` pour les requêtes DB
- Ne jamais utiliser `client` directement depuis le renderer (contextIsolation)
- Les erreurs sont propagées via `throw` — gérer les exceptions côté UI
- `client.execute({ sql, args })` pour toutes les requêtes — `.rows` pour les résultats, `.rows[0]` pour une ligne

---

## 5. Règles métier

### Congés payés (CP)

| Concept | Détail |
|---|---|
| Acquisition | `cp_mensuel` jours par mois (défaut 2.08 ≈ 25j/an) |
| Période N | 1er juin → 31 mai |
| Report | À la clôture : `cp_n` → `cp_n1`, `cp_n` remis à 0 |
| Débit | CP N-1 utilisé en priorité, puis CP N |
| Traitement auto | `executerTraitementCP(annee)` — configurable jour/mois dans admin |

### RTT

| Concept | Détail |
|---|---|
| Éligibilité | `a_droit_rtt = 1` dans `salaries` |
| Attribution | Annuelle via `executerTraitementRTT(annee)` |
| Calcul | `nb_rtt` = Jours période - WE - Fériés (hors WE, depuis DB) - CP (25) - Forfait jours (218) |
| Période | Dynamique, basée sur la date de traitement RTT configurée (ex: 1 juin N → 31 mai N+1) |
| Configuration | Admin → Planning des traitements → bloc "Calcul RTT par année" |
| Débit | 1 RTT = 1 jour |

### Récupération (RECUP)

| Concept | Détail |
|---|---|
| Unité en DB | **Heures** (`recup_heures` dans `soldes`) |
| Conversion | 1 jour = **7 heures** (constante dans tout le projet) |
| Éligibilité | `a_droit_recup = 1` dans `salaries` |
| Débit | Via `updateSoldesAfterAbsence` — type `RECUP` |

### Maladie

- Aucun solde débité
- Enregistrée en base comme toute autre absence
- Durée calculée en jours ouvrés (hors week-ends et jours fériés)

### Calcul des durées

Le handler `calculerDuree(dateDebut, dateFin, debutPeriode, finPeriode)` dans `main.js` :
- Exclut les week-ends
- Exclut les jours fériés (table `jours_feries`)
- `debutPeriode` : `'matin'` (défaut) | `'apres-midi'` (retrait de 0.5j)
- `finPeriode` : `'fin-journee'` (défaut) | `'midi'` (retrait de 0.5j)
- Les deux se cumulent : ex. après-midi → midi sur 3 jours ouvrés = 2j

---

## 6. Conventions CSS

### Variables (définies dans `common.css`)

```css
:root {
    --bleu:   rgb(0, 108, 137);
    --mauve:  rgb(116, 43, 135);
    --rouge:  rgb(181, 22, 63);
    --orange: rgb(237, 113, 17);
    --jaune:  rgb(249, 198, 73);

    /* Theme light (par défaut) */
    --bg-body: #f5f5f5;
    --bg-surface: #ffffff;
    --bg-surface-alt: #f8f9fa;
    --bg-input: rgba(255, 255, 255, 0.95);
    --text-primary: #333;
    --text-secondary: #666;
    --text-muted: #999;
    --border-color: #ddd;
}

[data-theme="dark"] {
    --bg-body: #1a1a1a;
    --bg-surface: #242424;
    --bg-surface-alt: #2e2e2e;
    --bg-input: #1e1e1e;
    --text-primary: #e0e0e0;
    --text-secondary: #b0b0b0;
    --text-muted: #888;
    --border-color: #3a3a3a;
}
```

### Mode sombre / clair

- Toggle via bouton lune/soleil dans le header (user + admin)
- Persisté en `localStorage('theme')` — partagé entre toutes les pages
- Le thème est appliqué via `data-theme="dark"` sur `<html>`
- En dark mode, la navigation utilise `--jaune` au lieu de `--bleu`
- Transition globale de 0.1s sur tous les éléments
- Surcharges dark organisées en fin de chaque fichier CSS

### Hauteurs des layouts (critique pour le scroll)

La page est `overflow: hidden` sur `body` — tout le scroll est géré par les conteneurs internes.

```
Page user  : header (~80px)
             └── .dashboard-content-new : height: calc(100vh - 80px)

Page admin : header (~80px) + nav (~62px) + padding (8px×2) = ~160px
             └── .dashboard-content-new : height: calc(100vh - 160px)
```

### Scoping CSS admin

Les styles de la section "Mes Congés" admin sont **toujours préfixés** pour éviter les conflits :

```css
/* ✓ Correct */
#mes-conges-section .form-group-compact { ... }

/* ✗ À éviter — affecterait toutes les sections */
.form-group-compact { ... }
```

### Structure des commentaires de section

```css
/* ========== NOM DE LA SECTION ========== */
```

### Responsive

- Breakpoint principal : `@media (max-width: 1200px)` — passage en colonne unique
- En dessous de 1200px : `height: auto` sur `.dashboard-content-new`, scroll géré par le conteneur parent
- L'app est desktop-first, pas de breakpoints < 900px prévus

---

## 7. Fonctionnalités existantes

### Page login (`login.html`)

- Email + mot de passe hashé bcrypt (10 rounds)
- Détection premier login (`checkFirstLogin`) → forçage changement de mot de passe
- Redirection automatique selon le rôle (`admin` → dashboard admin, `user` → dashboard user)

### Dashboard salarié (`dashboard-user.html`)

- Affichage des soldes (CP N-1, CP N, RTT, Récup) en cartes compactes 2×2
  - Sous chaque tuile, mention « (-X.Xj en attente) » si une demande non validée engage déjà le solde
- Formulaire de demande d'absence (CP, RTT, RECUP)
- Panel sidebar « Mes demandes en cours » listant les demandes `en_attente`
- Calendrier annuel interactif avec visualisation des absences par couleur
  - Style `en-attente` (opacity + dashed) sur les jours non encore validés
- Prévisualisation avant soumission (surlignage des jours sur le calendrier)
- Alertes : période passée, chevauchement (incluant les demandes en attente), solde insuffisant
- Toast temps réel auto-dismiss 5s à la validation/refus de demande par un admin

### Dashboard admin (`dashboard-admin.html`) — 7 sections

| Section | Fonctionnalité |
|---|---|
| Mes Congés | Accès admin à sa propre interface salarié (auto-validé, génère le PDF) |
| Calendrier | Vue globale de toutes les absences par période (avec distinction visuelle en_attente) |
| Validation | Bandeau « Demandes à valider » + historique par salarié + ajout arrêt maladie |
| Salariés | CRUD complet, activation/désactivation, reset mot de passe, récap PDF |
| Jours Fériés | Ajout manuel + bouton « Générer les 10 fériés légaux » (algorithme de Pâques) |
| Statistiques | 3 graphiques Chart.js : absences/mois, répartition/type, soldes/salarié |
| Paramètres | Taux CP globaux, dates des traitements auto, calcul RTT, historique des traitements |

### Workflow de validation des congés

- Le salarié pose une demande → statut `en_attente`, **aucun débit de solde**
- Un bandeau « Demandes à valider » apparaît dans la section Validation, avec un badge compteur sur la nav admin
- Polling 30s pour la mise à jour multi-postes
- Validation admin : statut → `valide`, débit du solde, génération du **PDF officiel**, notification user
- Refus admin : statut → `refuse` (sans motif depuis v1.0.0), pas de débit, notification user
- Toast vert 3s côté admin après validation/refus
- Toutes les poses admin (Mes Congés, ajout maladie, import Excel, split d'absence) bypass le workflow via `autoValide: true`

### Réaffectation correcte des soldes (v6+)

- À la pose, `updateSoldesAfterAbsence` (et `debiterSoldes` du workflow) écrivent la décomposition exacte du débit dans les colonnes `debite_cp_n1` / `debite_cp_n` de la table absences
- À la suppression, `deleteAbsence` lit ces colonnes et recrédite chaque compte à l'identique
- Fallback ancien comportement (recrédite tout sur un seul compte) pour les absences pré-v6 sans données
- L'année du recrédit est extraite de `absence.date_debut` (et non plus de `new Date()`)

### Traitements automatiques

Configurables depuis l'admin (jour + mois d'exécution) :
- **CP_ANNUEL** : reporte `cp_n` → `cp_n1`, remet `cp_n` à 0, alimente en fonction de `cp_mensuel`
- **RTT_ANNUEL** : calcule et attribue les RTT selon `rtt_annuels`
- Historique consultable dans `historique_traitements`

---

## 8. Easter eggs admin

Raccourcis clavier globaux dans le dashboard admin :

| Séquence | Action |
|---|---|
| `Ctrl` + `D` `E` `B` `U` `G` | **DB Browser** — accès complet aux tables Turso (édition cellule par double-clic, ajout/suppression de ligne, SQL libre). À manipuler avec précaution, pas de sécurité applicative. |
| `Ctrl` + `L` `O` `A` `D` | Ouvre une modale d'import Excel |
| `Ctrl` + `S` `A` `V` `E` | Déclenche un export Excel complet de toutes les données |

---

## 9. Build & distribution

```bash
# Développement
npm start

# Build (binaire non packageé)
npm run package
# → Génère dans /out/conges-lce-win32-x64/

# Installeur Windows (Squirrel)
npm run make
# → Génère dans /out/make/squirrel.windows/

# Dépendances natives (sqlite3, bcrypt)
# → Gérées automatiquement par @electron-forge/plugin-auto-unpack-natives
```

### Points d'attention pour la distribution

- Plus de DB locale — toutes les données sont sur Turso (cloud)
- Les migrations sont appliquées au démarrage via le système `MIGRATIONS[]` / `db_version`
- Les backups sont gérés par Turso (ou export périodique optionnel)
- Le package ne contient plus de template `conges.db`

### Mises à jour automatiques (depuis v1.0.0, 25/04/2026)

L'app utilise la lib **`update-electron-app`** qui s'appuie sur le service public `update.electronjs.org` pour proxifier les GitHub Releases. Pas de serveur de mise à jour à héberger. Pré-requis : **repo GitHub public** (sinon le service ne peut pas voir les releases).

**Configuration** dans `main.js` (sous garde `app.isPackaged`) :
```js
const { updateElectronApp } = require('update-electron-app');
updateElectronApp({ updateInterval: '1 hour', notifyUser: false });
```

**Flow** :
1. Au démarrage de l'app + toutes les heures → check `https://update.electronjs.org/Althahir/CONGES/win32-x64/<version>`
2. Si nouvelle version → téléchargement en background du `.nupkg`
3. Une fois le téléchargement terminé → `autoUpdater.on('update-downloaded')` envoie un IPC `update-downloaded` au renderer
4. Le renderer affiche un **toast custom** « Mise à jour disponible — Version X.X.X téléchargée — [Redémarrer] » (sans bouton de fermeture, l'utilisateur clique quand il est prêt)
5. Au clic Redémarrer → `window.api.applyUpdate()` → `autoUpdater.quitAndInstall()` → l'app redémarre avec la nouvelle version

**Bandeau version** : section Paramètres admin → bandeau bleu « Version installée : vX.X.X » (rempli via `window.api.getAppVersion()`). Permet de valider visuellement qu'une mise à jour a bien été appliquée et facilite le support.

**Procédure pour publier une nouvelle version** :
```
1. Faire les modifs et commiter
2. Bumper la version dans package.json + package-lock.json (ex: 1.0.2 → 1.0.3)
3. git commit + git tag vX.X.X + git push --tags
4. npm run make
5. Aller sur https://github.com/Althahir/CONGES/releases/new
6. Tag : vX.X.X (sélectionner le tag déjà créé)
7. Title : vX.X.X
8. Drag-drop les 3 fichiers de out/make/squirrel.windows/x64/ :
   - Gestion des Congés-X.X.X Setup.exe
   - conges_lce-X.X.X-full.nupkg
   - RELEASES (les 3 obligatoires, sinon la maj échoue)
9. Laisser "Set as the latest release" coché, NE PAS cocher pre-release
10. Publish release
```

Dans l'heure, tous les postes connectés à Internet auront le toast.

**Tests / pre-releases** : `update.electronjs.org` ignore les releases marquées pre-release. Utiliser ce flag si on veut publier une release de test sans déclencher l'auto-update chez les users.

---

## 10. Déploiement multi-utilisateurs

> **Contexte** : l'application est utilisée par ~5 salariés sur des postes différents (bureau + télétravail). Toutes les instances doivent partager les mêmes données en temps réel.

### Option retenue : Turso (SQLite cloud)

> **Historique** : l'approche initiale (fichier SQLite partagé via OneDrive) a été abandonnée car OneDrive crée des fichiers de conflit (`conges-NomPC.db`) au lieu de synchroniser le fichier — SQLite et la synchronisation de fichiers cloud sont fondamentalement incompatibles.

Toutes les instances Electron se connectent à la **même base Turso** hébergée dans le cloud. Pas de fichier local, pas de synchronisation, pas de conflit.

```
Poste 1 (bureau)      ──┐
Poste 2 (bureau)      ──┤──► Turso DB (cloud, libSQL)
Poste 3 (télétravail) ──┘    https://xxx.turso.io
```

### Avantages

| Avantage | Détail |
|---|---|
| **Pas de conflit** | Plus de fichier partagé = plus de fichiers de conflit OneDrive |
| **Multi-postes natif** | Turso gère les accès concurrents nativement |
| **Télétravail** | Fonctionne depuis n'importe quel poste avec Internet, sans VPN |
| **Pas de serveur** | L'app Electron se connecte directement à Turso (pas besoin de Render ou d'API intermédiaire) |
| **Compatible SQLite** | Turso est basé sur libSQL (fork de SQLite) — même syntaxe SQL |

### Architecture DB

```
Electron (main process)
  └─→ @libsql/client (npm)
        └─→ createClient({ url, authToken })
              └─→ client.execute({ sql, args })
                    └─→ Turso DB (HTTPS)
```

Remplacement de l'ancien pattern :
- ~~`sqlite3.Database(filePath)`~~ → `createClient({ url, authToken })`
- ~~`db.all(sql, params, callback)`~~ → `await client.execute({ sql, args })` → `.rows`
- ~~`db.get(sql, params, callback)`~~ → `await client.execute({ sql, args })` → `.rows[0]`
- ~~`db.run(sql, params, callback)`~~ → `await client.execute({ sql, args })`

### Configuration

L'URL et le token Turso sont stockés dans `config.json` (AppData) :

```json
{
    "tursoUrl": "libsql://conges-xxx.turso.io",
    "tursoToken": "eyJhbGciOi..."
}
```

Au premier lancement, l'application demande ces informations (ou elles sont pré-configurées pour le déploiement).

### Free tier Turso

| Limite | Valeur | Suffisant ? |
|---|---|---|
| Stockage | 9 Go | Largement (DB < 10 Mo) |
| Lectures | 25 milliards/mois | Largement |
| Écritures | 100 millions/mois | Largement |
| Mise en veille | Aucune | Turso est toujours actif |

### Éléments supprimés (ancien système fichier) — supprimés le 31/03/2026

- `sqlite3` (npm) — remplacé par `@libsql/client`
- `withDatabase()` / `scheduleClose()` / `DB_CLOSE_DELAY` — plus de gestion ouverture/fermeture
- `acquireLock()` / `releaseLock()` / `withWriteLock()` — plus de verrou fichier `.lock`
- `WRITE_CHANNELS` / `dbQueue` / `dbOpenCount` — plus de sérialisation d'accès
- `getDbFolder()` / copie template `conges.db` — plus de fichier DB local
- `backupDatabase()` — remplacé par les backups intégrés Turso
- `PRAGMA journal_mode` / `PRAGMA busy_timeout` — géré par Turso
- `src/conges.db` — template supprimé (schéma géré par migrations)
- Tous les callbacks `db.get()` / `db.all()` / `db.run()` — remplacés par `await ctx.db.execute({ sql, args })`

### Attention SQL (Turso vs SQLite3)

Turso respecte le standard SQL : les guillemets doubles `"..."` sont des identifiants de colonne, pas des chaînes. Toujours utiliser des guillemets simples `'...'` pour les valeurs littérales dans les requêtes SQL.

```javascript
// ✗ Incorrect — Turso interprète "valide" comme un nom de colonne
sql: 'SELECT * FROM absences WHERE statut = "valide"'

// ✓ Correct
sql: `SELECT * FROM absences WHERE statut = 'valide'`
```

### Procédure de déploiement

1. Créer un compte Turso et une base de données (`turso db create conges`)
2. Récupérer l'URL et le token (`turso db show conges --url` + `turso db tokens create conges`)
3. Packager l'app : `npm run make`
4. Sur chaque poste :
   - Installer le `.exe` depuis `out/make/squirrel.windows/x64/`
   - Créer le dossier `%appdata%\conges-lce\` avec le fichier `config.json` :
     ```json
     {
       "tursoUrl": "libsql://conges-xxx.turso.io",
       "tursoToken": "eyJ..."
     }
     ```
   - Lancer l'app — les migrations créent les tables automatiquement au premier lancement

---

## 11. Roadmap

Voir `DOCS/TODO.md` pour la liste complète et priorisée.

### Résumé des priorités hautes

1. ~~**Handler `ajouter-recup`**~~ ✅ **Fait**
2. ~~**UI Notifications**~~ ✅ **Fait** — badge cloche + dropdown + toasts
3. ~~**Refonte CSS + Dark mode**~~ ✅ **Fait** — thème sombre complet, navigation unifiée
4. ~~**Déploiement multi-utilisateurs**~~ ✅ **Fait** — migration Turso terminée le 31/03/2026
5. ~~**RTT annuels par salarié**~~ ✅ **Fait** — calcul complet, UI, notifications, migration DB
6. ~~**Backup automatique DB**~~ ✅ **Fait** — copie quotidienne au démarrage, rétention 60 jours
7. ~~**Nettoyage assets + icônes**~~ ✅ **Fait** — 9 images inutilisées supprimées, icônes cohérentes (logo.ico pour l'app, favicon3.ico pour installateur/fenêtre, favicon2.png pour topbars)
8. ~~**Taille minimale fenêtre**~~ ✅ **Fait** — `minWidth: 1100, minHeight: 700`
9. ~~**Demi-journées début/fin**~~ ✅ **Fait** — checkboxes "Début après-midi" + "Fin à midi", alertes vert/orange
10. ~~**Workflow validation des congés**~~ ✅ **Fait (17/04/2026)** — en_attente / valide / refuse, bandeau admin, notif user, PDF à la validation
11. ~~**DB Browser easter egg**~~ ✅ **Fait (17/04/2026)** — refonte de Ctrl+DEBUG : navigation des tables Turso, édition cellule, ajout/suppression ligne, SQL libre
12. ~~**Fix réaffectation soldes CP à la suppression**~~ ✅ **Fait (25/04/2026)** — migration v6 + tracking décomposition CP_N1/CP_N
13. ~~**Navbar admin responsive**~~ ✅ **Fait (25/04/2026)** — palier @768px icon-only, palier @900px compactage
14. ~~**Calendrier scroll vertical sur viewport courte**~~ ✅ **Fait (25/04/2026)** — breakpoint @max-height 750px
15. ~~**Guide d'installation v1.0.0**~~ ✅ **Fait (25/04/2026)** — `DOCS/Guide_Installation_Conges_LCE.docx` généré par `scripts/build-install-guide.py`
16. ~~**Tag v1.0.0 + build de production**~~ ✅ **Fait (25/04/2026)** — tag git poussé, installeur Squirrel disponible
17. ~~**Mises à jour automatiques via update.electronjs.org**~~ ✅ **Fait (25/04/2026)** — lib `update-electron-app`, repo GitHub passé public, validation de bout en bout via release v1.0.1
18. ~~**Bandeau version dans Paramètres**~~ ✅ **Fait (25/04/2026)** — handler IPC `getAppVersion`, affichage en haut de la section Paramètres admin
19. ~~**Toast custom de mise à jour**~~ ✅ **Fait (25/04/2026, v1.0.2)** — remplace le dialog Electron par défaut par un toast cohérent avec le design, sans bouton de fermeture (l'utilisateur clique Redémarrer quand il est prêt)

---

*Document maintenu par Excellium — dernière mise à jour 25/04/2026 (v1.0.2 — auto-update, toast custom de mise à jour, bandeau version)*
