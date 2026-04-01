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

-- Absences
CREATE TABLE absences (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id   INTEGER REFERENCES salaries(id),
    type         TEXT NOT NULL,      -- 'CP' | 'RTT' | 'RECUP' | 'MALADIE'
    date_debut   TEXT NOT NULL,      -- Format ISO YYYY-MM-DD
    date_fin     TEXT NOT NULL,
    duree_jours  REAL DEFAULT 0,     -- En jours ouvrés
    duree_heures REAL DEFAULT 0,     -- En heures (utilisé pour RECUP)
    commentaire  TEXT,
    statut       TEXT DEFAULT 'approuve'
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

-- Historique des modifications (audit trail — pas de handler IPC, usage interne)
CREATE TABLE historique_modifs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    salarie_id       INTEGER REFERENCES salaries(id),
    action           TEXT NOT NULL,
    table_concernee  TEXT NOT NULL,
    details          TEXT,
    date_modif       DATETIME DEFAULT CURRENT_TIMESTAMP,
    modifie_par      INTEGER REFERENCES salaries(id)
);
```

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
- Formulaire de demande d'absence (CP, RTT, RECUP, MALADIE)
- Calendrier annuel interactif avec visualisation des absences par couleur
- Prévisualisation avant soumission (surlignage des jours sur le calendrier)
- Alertes : période passée, chevauchement avec une absence existante, solde insuffisant

### Dashboard admin (`dashboard-admin.html`) — 6 sections

| Section | Fonctionnalité |
|---|---|
| Tableau de bord | Vue d'ensemble, statistiques globales |
| Salariés | CRUD complet, activation/désactivation, reset mot de passe |
| Absences | Liste toutes absences, modification, suppression avec recalcul solde |
| Calendrier | Vue globale de toutes les absences par période |
| Traitements | Configuration et exécution des traitements automatiques CP/RTT |
| Mes Congés | Accès admin à sa propre interface salarié (même layout que dashboard user) |

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
| `Ctrl` + `D` `E` `B` `U` `G` | Ouvre une modale de test des traitements automatiques |
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

---

*Document maintenu par Excellium — dernière mise à jour 31/03/2026 (migration Turso terminée, déploiement multi-postes opérationnel)*
