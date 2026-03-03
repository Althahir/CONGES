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
10. [Roadmap](#10-roadmap)

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

### Base de données de développement

La DB active est copiée automatiquement depuis `src/conges.db` (template) vers :
```
Windows : C:\Users\<user>\AppData\Roaming\conges-lce\conges.db
```
Pour réinitialiser la DB : supprimer ce fichier — il sera recopié au prochain démarrage.
Pour modifier le schéma : modifier `src/conges.db` (template), puis supprimer la DB active.

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
│   - SQLite3          │   - HTML/CSS/JS vanilla       │
│   - bcrypt           │   - Pas de framework          │
│   - pdfkit           │   - ES6+ async/await          │
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
                    └─→ db.all() / db.run()    [SQLite3]
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
│   │   ├── favicon2.ico
│   │   └── logo.png (ou similaire)
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

-- Paramètres RTT par année (⚠️ vérifier présence dans conges.db template)
CREATE TABLE rtt_annuels (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    annee_debut        INTEGER UNIQUE,
    nb_jours_travailles INTEGER,
    nb_cp_a_deduire    INTEGER
);
```

### Accès à la DB en développement

1. Installer [DB Browser for SQLite](https://sqlitebrowser.org/)
2. Ouvrir `C:\Users\<user>\AppData\Roaming\conges-lce\conges.db`
3. Toute modification est écrasée si la DB est supprimée et recréée depuis le template

---

## 4. Ajouter une fonctionnalité — flux IPC

### Exemple complet : ajouter un handler `monHandler`

**Étape 1 — `main.js`** : déclarer le handler (ajouter dans la section concernée)

```javascript
ipcMain.handle('monHandler', async (event, param1, param2) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM ma_table WHERE id = ?', [param1], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
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

- Toujours wrapper les callbacks SQLite3 dans une `Promise`
- Ne jamais utiliser `db` directement depuis le renderer (contextIsolation)
- Les erreurs sont propagées via `reject(err)` — gérer les exceptions côté UI
- `db.run()` pour INSERT/UPDATE/DELETE, `db.get()` pour une ligne, `db.all()` pour plusieurs

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
| Calcul | Basé sur `rtt_annuels` (jours travaillés - CP déduits) |
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

Le handler `calculerDuree(dateDebut, dateFin, periodeType)` dans `main.js` :
- Exclut les week-ends
- Exclut les jours fériés (table `jours_feries`)
- `periodeType` : `'matin'` | `'apres-midi'` | `'journee'`

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
}
```

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

- La DB template (`src/conges.db`) est incluse dans le ASAR
- À la première installation, elle est copiée dans `AppData` de l'utilisateur
- **Si le schéma évolue** (nouvelles tables/colonnes) : les utilisateurs existants n'auront pas les migrations → prévoir un système de migration DB

---

## 10. Roadmap

Voir `DOCS/TODO.md` pour la liste complète et priorisée.

### Résumé des priorités hautes

1. **Handler `ajouter-recup` manquant** — le bouton "Heures supplémentaires" existe en UI mais le backend IPC n'est pas implémenté dans `main.js`
2. **Vérifier table `rtt_annuels`** — les handlers existent mais la table n'est peut-être pas dans le template `conges.db`
3. **UI Notifications** — la table et les handlers DB existent, l'interface de lecture/badge est absente
4. **Taille minimale fenêtre** — ajouter `minWidth: 1100, minHeight: 700` dans `BrowserWindow` de `main.js`

---

*Document maintenu par Excellium — dernière mise à jour 03/03/2026*
