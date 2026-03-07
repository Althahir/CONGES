const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
if (require('electron-squirrel-startup')) {
  app.quit();
  return;
}

// Forcer le dossier userData à "conges-lce" quel que soit le productName
app.setPath('userData', path.join(app.getPath('appData'), 'conges-lce'));

// Contexte partagé avec les handlers
const ctx = { db: null, mainWindow: null };

// Wrapper IPC centralisé — try/catch + logging sur tous les handlers
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
require('./handlers/navigation')(ctx, safeHandle);

// ========== BASE DE DONNÉES ==========

function backupDatabase() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'conges.db');
    if (!fs.existsSync(dbPath)) return;

    const backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const backupPath = path.join(backupDir, `conges_${today}.db`);
    if (!fs.existsSync(backupPath)) {
        try {
            fs.copyFileSync(dbPath, backupPath);
            console.log(`Backup créé : ${backupPath}`);
        } catch (err) {
            console.error('Erreur backup DB :', err);
        }
    }

    const now = Date.now();
    const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
    try {
        const files = fs.readdirSync(backupDir).filter(f => f.startsWith('conges_') && f.endsWith('.db'));
        for (const file of files) {
            const match = file.match(/conges_(\d{4}-\d{2}-\d{2})\.db/);
            if (!match) continue;
            const fileAge = now - new Date(match[1]).getTime();
            if (fileAge > SIXTY_DAYS) {
                fs.unlinkSync(path.join(backupDir, file));
                console.log(`Backup supprimé (>60j) : ${file}`);
            }
        }
    } catch (err) {
        console.error('Erreur nettoyage backups :', err);
    }
}

function connectDatabase() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'conges.db');

    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    if (!fs.existsSync(dbPath)) {
        const templatePath = path.join(__dirname, 'conges.db');
        try {
            fs.copyFileSync(templatePath, dbPath);
            console.log("Première installation : Base de données copiée dans AppData.");
        } catch (err) {
            console.error("Erreur lors de la copie de la base :", err);
        }
    }

    ctx.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Erreur de connexion SQLite :", err);
        } else {
            console.log("Base de données active : " + dbPath);
            runMigrations();
        }
    });
}

// ========== SYSTEME DE MIGRATIONS ==========

// Chaque entrée = une migration. L'index+1 = le numéro de version cible.
// La version 1 correspond au template DB complet (toutes les tables déjà présentes).
// Les migrations suivantes sont pour les DB existantes qui doivent évoluer.
const MIGRATIONS = [
    // v1 : schéma initial complet (template DB) — rien à faire pour les nouvelles installations
    function v1(db, done) {
        // Pour les anciennes DB sans db_version : s'assurer que toutes les tables/colonnes existent
        db.serialize(function() {
            db.run(`CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL)`);

            db.run(`CREATE TABLE IF NOT EXISTS rtt_annuels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                annee_debut INTEGER NOT NULL UNIQUE,
                date_debut DATE NOT NULL DEFAULT '',
                date_fin DATE NOT NULL DEFAULT '',
                nb_jours_periode INTEGER,
                nb_jours_we INTEGER,
                nb_jours_feries_hors_we INTEGER,
                nb_jours_travailles INTEGER,
                nb_cp_a_deduire INTEGER DEFAULT 25,
                nb_rtt INTEGER
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS heures_supplementaires (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                salarie_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                heures REAL NOT NULL,
                commentaire TEXT,
                date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (salarie_id) REFERENCES salaries(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS historique_modifs (
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

            // Colonnes potentiellement manquantes
            const alterCols = [
                "ALTER TABLE absences ADD COLUMN debut_periode TEXT DEFAULT 'journee-complete'",
                "ALTER TABLE absences ADD COLUMN fin_periode TEXT DEFAULT 'journee-complete'",
                "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_periode INTEGER",
                "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_we INTEGER",
                "ALTER TABLE rtt_annuels ADD COLUMN nb_jours_feries_hors_we INTEGER",
                "ALTER TABLE rtt_annuels ADD COLUMN nb_rtt INTEGER",
            ];
            alterCols.forEach(sql => {
                db.run(sql, () => {}); // Ignorer les erreurs duplicate column
            });

            // Index
            db.run('CREATE INDEX IF NOT EXISTS idx_absences_salarie ON absences(salarie_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_soldes_salarie_annee ON soldes(salarie_id, annee)');
        });
        done();
    },

    // v2, v3... : futures migrations (ajouter ici)
    // function v2(db, done) { db.run('ALTER TABLE ...', done); },
];

function runMigrations() {
    const db = ctx.db;

    // S'assurer que la table db_version existe
    db.run('CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL)', () => {
        db.get('SELECT version FROM db_version', (err, row) => {
            let currentVersion = (row && row.version) ? row.version : 0;

            if (currentVersion >= MIGRATIONS.length) {
                console.log(`DB version ${currentVersion} — à jour`);
                return;
            }

            console.log(`DB version ${currentVersion} — ${MIGRATIONS.length - currentVersion} migration(s) à appliquer`);

            function applyNext(v) {
                if (v >= MIGRATIONS.length) {
                    // Mettre à jour la version
                    if (currentVersion === 0) {
                        db.run('INSERT INTO db_version VALUES (?)', [MIGRATIONS.length], () => {
                            console.log(`DB migrée vers version ${MIGRATIONS.length}`);
                        });
                    } else {
                        db.run('UPDATE db_version SET version = ?', [MIGRATIONS.length], () => {
                            console.log(`DB migrée vers version ${MIGRATIONS.length}`);
                        });
                    }
                    return;
                }

                console.log(`Application migration v${v + 1}...`);
                MIGRATIONS[v](db, () => applyNext(v + 1));
            }

            applyNext(currentVersion);
        });
    });
}

// ========== FENÊTRE ==========

function createWindow() {
    ctx.mainWindow = new BrowserWindow({
        title: 'Gestionnaire de congés EXCELLIUM',
        fullscreen: false,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, 'assets/icon.ico'),
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

app.whenReady().then(() => {
    backupDatabase();
    connectDatabase();
    createWindow();

    setTimeout(() => {
        verifierTraitementsAutomatiques();
    }, 2000);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (ctx.db) ctx.db.close();
    if (process.platform !== 'darwin') app.quit();
});
