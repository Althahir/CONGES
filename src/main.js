const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

// ========== CONFIGURATION CHEMIN DB ==========

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

async function getDbFolder() {
    // Vérifier si un chemin est déjà configuré et valide
    const config = readConfig();
    if (config && config.dbFolder && fs.existsSync(config.dbFolder)) {
        console.log('Dossier DB (config) :', config.dbFolder);
        return config.dbFolder;
    }

    // Premier lancement ou dossier introuvable — demander à l'utilisateur
    const msg = config && config.dbFolder
        ? `Le dossier configuré est introuvable :\n${config.dbFolder}\n\nVeuillez sélectionner le dossier contenant la base de données.`
        : 'Premier lancement : sélectionnez le dossier réseau (SharePoint/OneDrive) où stocker la base de données.';

    const result = await dialog.showOpenDialog({
        title: 'Dossier de la base de données',
        message: msg,
        properties: ['openDirectory'],
        buttonLabel: 'Sélectionner ce dossier'
    });

    if (result.canceled || !result.filePaths.length) {
        app.quit();
        return null;
    }

    const folder = result.filePaths[0];
    saveConfig({ dbFolder: folder });
    console.log('Dossier DB configuré :', folder);
    return folder;
}

// Channels qui font des écritures DB (INSERT/UPDATE/DELETE)
const WRITE_CHANNELS = new Set([
    'login', 'setPassword', 'resetPassword',
    'createSalarie', 'updateSalarie', 'deactivateSalarie',
    'updateSoldes', 'updateSoldesAfterAbsence',
    'createAbsence', 'deleteAbsence', 'updateAbsence',
    'ajouter-recup',
    'addJourFerie', 'deleteJourFerie',
    'addRTTAnnuel',
    'updateConfigTraitement', 'logHistoriqueTraitement',
    'executerTraitementCP', 'executerTraitementCPMensuel', 'executerTraitementRTT',
    'marquerNotificationLue', 'creerNotification',
    'updateConfigApp'
]);

// Wrapper IPC centralisé — try/catch + logging + verrou écriture réseau
function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            if (WRITE_CHANNELS.has(channel)) {
                return await ctx.withWriteLock(() => handler(event, ...args));
            }
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

// ========== BASE DE DONNÉES ==========

function backupDatabase(dbFolder) {
    const dbPath = path.join(dbFolder, 'conges.db');
    if (!fs.existsSync(dbPath)) return;

    // Backups en local (AppData), pas sur le réseau
    const backupDir = path.join(app.getPath('userData'), 'backups');
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

// ========== VERROU ÉCRITURE DB RÉSEAU ==========

const LOCK_TIMEOUT = 5000; // Timeout max 5s pour obtenir le verrou
const LOCK_RETRY = 100;    // Réessayer toutes les 100ms

let lockFilePath = null;

function acquireLock() {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        function tryLock() {
            try {
                // O_CREAT | O_EXCL = création exclusive (échoue si fichier existe)
                const fd = fs.openSync(lockFilePath, 'wx');
                fs.writeFileSync(lockFilePath, `${process.pid}-${Date.now()}`);
                fs.closeSync(fd);
                resolve();
            } catch (err) {
                if (err.code === 'EEXIST') {
                    // Vérifier si le lock est périmé (>30s = processus probablement crashé)
                    try {
                        const stat = fs.statSync(lockFilePath);
                        if (Date.now() - stat.mtimeMs > 30000) {
                            fs.unlinkSync(lockFilePath);
                            return tryLock();
                        }
                    } catch (e) { /* fichier supprimé entre-temps */ }

                    if (Date.now() - start > LOCK_TIMEOUT) {
                        reject(new Error('Impossible d\'accéder à la base de données : un autre poste est en cours d\'écriture. Réessayez dans quelques secondes.'));
                    } else {
                        setTimeout(tryLock, LOCK_RETRY);
                    }
                } else {
                    reject(err);
                }
            }
        }

        tryLock();
    });
}

function releaseLock() {
    try {
        if (lockFilePath && fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
        }
    } catch (e) {
        console.error('Erreur libération lock :', e);
    }
}

// Wrapper pour les écritures DB — acquiert le verrou, exécute, relâche
function withWriteLock(fn) {
    return acquireLock()
        .then(() => fn())
        .finally(() => releaseLock());
}

// Exposer withWriteLock dans le contexte pour les handlers
ctx.withWriteLock = withWriteLock;

function connectDatabase(dbFolder) {
    const dbPath = path.join(dbFolder, 'conges.db');
    lockFilePath = path.join(dbFolder, 'conges.db.lock');

    if (!fs.existsSync(dbPath)) {
        const templatePath = path.join(__dirname, 'conges.db');
        try {
            fs.copyFileSync(templatePath, dbPath);
            console.log("Première installation : Base de données copiée dans " + dbFolder);
        } catch (err) {
            console.error("Erreur lors de la copie de la base :", err);
        }
    }

    ctx.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Erreur de connexion SQLite :", err);
        } else {
            console.log("Base de données active : " + dbPath);
            // Activer WAL pour lectures simultanées sans blocage
            ctx.db.run('PRAGMA journal_mode = WAL', (err) => {
                if (err) console.error('Erreur activation WAL :', err);
                else console.log('Mode WAL activé');
            });
            ctx.db.run('PRAGMA busy_timeout = 5000'); // Attendre 5s si DB occupée
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

    // v2 : taux CP globaux + arrêt maladie par salarié + historique taux + traitement CP mensuel
    function v2(db, done) {
        db.serialize(function() {
            // Table config applicative (taux CP globaux)
            db.run(`CREATE TABLE IF NOT EXISTS config_app (
                cle TEXT PRIMARY KEY,
                valeur TEXT NOT NULL
            )`);

            // Valeurs par défaut
            db.run(`INSERT OR IGNORE INTO config_app (cle, valeur) VALUES ('taux_cp_normal', '2.08333')`);
            db.run(`INSERT OR IGNORE INTO config_app (cle, valeur) VALUES ('taux_cp_arret', '1.66333')`);

            // Historique des changements de taux par salarié
            db.run(`CREATE TABLE IF NOT EXISTS historique_taux (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                salarie_id INTEGER NOT NULL,
                date_effet TEXT NOT NULL,
                ancien_taux TEXT NOT NULL,
                nouveau_taux TEXT NOT NULL,
                date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (salarie_id) REFERENCES salaries(id)
            )`);

            // Nouvelles colonnes sur salaries
            const alterCols = [
                "ALTER TABLE salaries ADD COLUMN en_arret_maladie INTEGER DEFAULT 0",
                "ALTER TABLE salaries ADD COLUMN date_arret_maladie TEXT",
            ];
            alterCols.forEach(sql => {
                db.run(sql, () => {}); // Ignorer si colonne existe déjà
            });

            // Index
            db.run('CREATE INDEX IF NOT EXISTS idx_historique_taux_salarie ON historique_taux(salarie_id)');
        });
        done();
    },
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
    const dbFolder = await getDbFolder();
    if (!dbFolder) return; // L'utilisateur a annulé → app.quit() déjà appelé

    backupDatabase(dbFolder);
    connectDatabase(dbFolder);
    createWindow();

    setTimeout(() => {
        verifierTraitementsAutomatiques();
    }, 2000);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    releaseLock(); // Nettoyer le verrou réseau
    if (ctx.db) ctx.db.close();
    if (process.platform !== 'darwin') app.quit();
});
