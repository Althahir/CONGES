const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
if (require('electron-squirrel-startup')) {
  app.quit();
  return;
}

// Forcer le dossier userData à "conges-lce" quel que soit le productName
app.setPath('userData', path.join(app.getPath('appData'), 'conges-lce'));

// Contexte partagé avec les handlers
const ctx = { db: null, mainWindow: null };

// ========== CONFIGURATION TURSO ==========

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Erreur lecture config.json :', e);
    }
    return null;
}

function saveConfig(config) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function getTursoConfig() {
    const config = readConfig();
    if (config && config.tursoUrl && config.tursoToken) {
        console.log('Config Turso (config.json) :', config.tursoUrl);
        return { url: config.tursoUrl, authToken: config.tursoToken };
    }

    // Premier lancement — demander URL et token
    const { response, checkboxChecked } = await dialog.showMessageBox({
        type: 'info',
        title: 'Configuration Turso',
        message: 'La base de données Turso n\'est pas encore configurée.\n\nVeuillez renseigner l\'URL et le token dans le fichier :\n' + CONFIG_PATH + '\n\nFormat attendu :\n{\n  "tursoUrl": "libsql://votre-db.turso.io",\n  "tursoToken": "votre-token"\n}',
        buttons: ['Quitter'],
    });

    app.quit();
    return null;
}

// Wrapper IPC centralisé — try/catch + logging
function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            return await handler(event, ...args);
        } catch (err) {
            console.error(`[IPC ERROR] ${channel}:`, err);
            throw err;
        }
    });
}

// ========== ENREGISTREMENT DES HANDLERS ==========

const { verifierTraitementsAutomatiques } = require('./handlers/traitements')(ctx, safeHandle);
require('./handlers/auth')(ctx, safeHandle);
require('./handlers/salaries')(ctx, safeHandle);
require('./handlers/soldes')(ctx, safeHandle);
require('./handlers/absences')(ctx, safeHandle);
require('./handlers/heures-sup')(ctx, safeHandle);
require('./handlers/notifications')(ctx, safeHandle);
require('./handlers/jours-feries')(ctx, safeHandle);
require('./handlers/rtt')(ctx, safeHandle);
require('./handlers/calcul')(ctx, safeHandle);
require('./handlers/pdf')(ctx, safeHandle);
require('./handlers/config-app')(ctx, safeHandle);
require('./handlers/navigation')(ctx, safeHandle);

// ========== BASE DE DONNÉES TURSO ==========

async function connectDatabase(tursoConfig) {
    ctx.db = createClient({
        url: tursoConfig.url,
        authToken: tursoConfig.authToken,
    });
    console.log('Connecté à Turso :', tursoConfig.url);
    await runMigrations();
}

// ========== SYSTEME DE MIGRATIONS ==========

// Chaque entrée = une migration async. L'index+1 = le numéro de version cible.
const MIGRATIONS = [
    // v1 : schéma initial complet — reproduit exactement la DB de production
    async function v1(db) {
        // Tables de base
        await db.execute(`CREATE TABLE IF NOT EXISTS salaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            mot_de_passe TEXT,
            role TEXT DEFAULT 'utilisateur',
            date_embauche DATE,
            type_contrat TEXT,
            cp_mensuel REAL DEFAULT 2.08333,
            a_droit_rtt INTEGER DEFAULT 0,
            a_droit_recup INTEGER DEFAULT 0,
            actif INTEGER DEFAULT 1,
            premiere_connexion INTEGER DEFAULT 1,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
            en_arret_maladie INTEGER DEFAULT 0,
            date_arret_maladie TEXT
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS soldes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salarie_id INTEGER REFERENCES salaries(id),
            annee INTEGER NOT NULL,
            cp_n REAL DEFAULT 0,
            cp_n1 REAL DEFAULT 0,
            rtt REAL DEFAULT 0,
            recup_heures REAL DEFAULT 0,
            derniere_maj DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS absences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salarie_id INTEGER REFERENCES salaries(id),
            type TEXT NOT NULL,
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            duree_jours REAL,
            duree_heures REAL,
            statut TEXT DEFAULT 'valide',
            commentaire TEXT,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
            debut_periode TEXT DEFAULT 'journee-complete',
            fin_periode TEXT DEFAULT 'journee-complete'
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS jours_feries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            libelle TEXT NOT NULL,
            annee INTEGER
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS config_traitements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            jour INTEGER,
            mois INTEGER,
            actif INTEGER DEFAULT 1,
            derniere_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Données initiales config_traitements (si table vide)
        await db.execute(`INSERT OR IGNORE INTO config_traitements (id, type, jour, mois, actif) VALUES (1, 'CP_ANNUEL', 1, 6, 1)`);
        await db.execute(`INSERT OR IGNORE INTO config_traitements (id, type, jour, mois, actif) VALUES (2, 'RTT_ANNUEL', 1, 6, 1)`);

        await db.execute(`CREATE TABLE IF NOT EXISTS historique_traitements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            date_execution TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            annee INTEGER,
            nb_salaries_traites INTEGER DEFAULT 0,
            details TEXT,
            statut TEXT DEFAULT 'success',
            message_erreur TEXT
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            titre TEXT,
            message TEXT,
            details TEXT,
            statut TEXT DEFAULT 'success',
            date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            lue INTEGER DEFAULT 0,
            user_id INTEGER
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL)`);

        await db.execute(`CREATE TABLE IF NOT EXISTS rtt_annuels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            annee_debut INTEGER NOT NULL UNIQUE,
            date_debut DATE NOT NULL DEFAULT '',
            date_fin DATE NOT NULL DEFAULT '',
            nb_jours_periode INTEGER,
            nb_jours_we INTEGER,
            nb_jours_feries_hors_we INTEGER,
            nb_jours_travailles INTEGER,
            nb_cp_a_deduire INTEGER DEFAULT 25,
            nb_rtt INTEGER,
            annee INTEGER
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS heures_supplementaires (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salarie_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            heures REAL NOT NULL,
            commentaire TEXT,
            date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (salarie_id) REFERENCES salaries(id)
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS historique_modifs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salarie_id INTEGER,
            action TEXT NOT NULL,
            table_concernee TEXT NOT NULL,
            details TEXT,
            date_modif DATETIME DEFAULT CURRENT_TIMESTAMP,
            modifie_par INTEGER,
            FOREIGN KEY (salarie_id) REFERENCES salaries(id),
            FOREIGN KEY (modifie_par) REFERENCES salaries(id)
        )`);

        // Colonnes potentiellement manquantes — ignorer les erreurs si elles existent déjà
        const alterCols = [
            "ALTER TABLE absences ADD COLUMN debut_periode TEXT DEFAULT 'journee-complete'",
            "ALTER TABLE absences ADD COLUMN fin_periode TEXT DEFAULT 'journee-complete'",
            "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_periode INTEGER",
            "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_we INTEGER",
            "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_feries_hors_we INTEGER",
            "ALTER TABLE rtt_annuels ADD COLUMN nb_rtt INTEGER",
        ];
        for (const sql of alterCols) {
            try { await db.execute(sql); } catch (e) { /* colonne existe déjà */ }
        }

        await db.execute('CREATE INDEX IF NOT EXISTS idx_absences_salarie ON absences(salarie_id)');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_soldes_salarie_annee ON soldes(salarie_id, annee)');
    },

    // v2 : taux CP globaux + arrêt maladie par salarié + historique taux
    async function v2(db) {
        await db.execute(`CREATE TABLE IF NOT EXISTS config_app (
            cle TEXT PRIMARY KEY,
            valeur TEXT NOT NULL
        )`);

        await db.execute(`INSERT OR IGNORE INTO config_app (cle, valeur) VALUES ('taux_cp_normal', '2.08333')`);
        await db.execute(`INSERT OR IGNORE INTO config_app (cle, valeur) VALUES ('taux_cp_arret', '1.66333')`);

        await db.execute(`CREATE TABLE IF NOT EXISTS historique_taux (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salarie_id INTEGER NOT NULL,
            date_effet TEXT NOT NULL,
            ancien_taux TEXT NOT NULL,
            nouveau_taux TEXT NOT NULL,
            date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (salarie_id) REFERENCES salaries(id)
        )`);

        const alterCols = [
            "ALTER TABLE salaries ADD COLUMN en_arret_maladie INTEGER DEFAULT 0",
            "ALTER TABLE salaries ADD COLUMN date_arret_maladie TEXT",
        ];
        for (const sql of alterCols) {
            try { await db.execute(sql); } catch (e) { /* colonne existe déjà */ }
        }

        await db.execute('CREATE INDEX IF NOT EXISTS idx_historique_taux_salarie ON historique_taux(salarie_id)');
    },
];

async function runMigrations() {
    const db = ctx.db;

    await db.execute('CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL)');
    const result = await db.execute('SELECT version FROM db_version');
    let currentVersion = (result.rows.length > 0 && result.rows[0].version) ? result.rows[0].version : 0;

    if (currentVersion >= MIGRATIONS.length) {
        console.log(`DB version ${currentVersion} — à jour`);
        return;
    }

    console.log(`DB version ${currentVersion} — ${MIGRATIONS.length - currentVersion} migration(s) à appliquer`);

    for (let v = currentVersion; v < MIGRATIONS.length; v++) {
        console.log(`Application migration v${v + 1}...`);
        await MIGRATIONS[v](db);
    }

    const sql = currentVersion === 0
        ? 'INSERT INTO db_version VALUES (?)'
        : 'UPDATE db_version SET version = ?';
    await db.execute({ sql, args: [MIGRATIONS.length] });
    console.log(`DB migrée vers version ${MIGRATIONS.length}`);
}

// ========== FENÊTRE ==========

function createWindow() {
    ctx.mainWindow = new BrowserWindow({
        title: 'Gestionnaire de congés EXCELLIUM',
        fullscreen: false,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, 'assets/app.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    ctx.mainWindow.loadFile(path.join(__dirname, 'pages', 'login.html'));
    ctx.mainWindow.maximize();
}

// ========== DÉMARRAGE ==========

app.whenReady().then(async () => {
    const tursoConfig = await getTursoConfig();
    if (!tursoConfig) return;

    await connectDatabase(tursoConfig);
    createWindow();

    setTimeout(async () => {
        try {
            await verifierTraitementsAutomatiques();
        } catch (err) {
            console.error('Erreur vérification traitements auto :', err);
        }
    }, 2000);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
