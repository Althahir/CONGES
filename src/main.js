const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

let mainWindow;
let db;

// Connexion à la base de données
function connectDatabase() {
    const dbPath = path.join(__dirname, '../database/conges.db');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Erreur de connexion à la base de données:', err);
        } else {
            console.log('Connecté à la base de données SQLite');
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'pages', 'login.html'));
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    connectDatabase();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (db) db.close();
    if (process.platform !== 'darwin') app.quit();
});

// ========== FONCTIONS UTILITAIRES ==========

// Calculer le nombre de jours ouvrés entre deux dates
function calculerJoursOuvres(dateDebut, dateFin, joursFeries) {
    const debut = new Date(dateDebut);
    const fin = new Date(dateFin);
    let joursOuvres = 0;
    
    // Convertir les jours fériés en tableau de dates ISO
    const feriesISO = joursFeries.map(f => f.date);
    
    // Parcourir chaque jour entre debut et fin (inclus)
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateISO = d.toISOString().split('T')[0];
        
        // Exclure samedi (6) et dimanche (0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Exclure les jours fériés
            if (!feriesISO.includes(dateISO)) {
                joursOuvres++;
            }
        }
    }
    
    return joursOuvres;
}
// ========== NAVIGATION ==========

ipcMain.handle('navigateTo', async (event, page) => {
    const pagePath = path.join(__dirname, 'pages', page);
    mainWindow.loadFile(pagePath);
    return { success: true };
});
// ========== GESTION DE L'AUTHENTIFICATION ==========

ipcMain.handle('login', async (event, email, password) => {
    return new Promise((resolve, reject) => {
        console.log('Tentative de connexion avec email:', email);
        db.get('SELECT * FROM salaries WHERE LOWER(email) = LOWER(?) AND actif = 1', [email], async (err, user) => {
            if (err) {
                console.error('Erreur DB:', err);
                reject(err);
                return;
            }
            
            console.log('Utilisateur trouvé:', user);
            
            if (!user) {
                console.log('Aucun utilisateur trouvé');
                resolve({ success: false, message: 'Email ou mot de passe incorrect' });
                return;
            }
            
            if (!user) {
                resolve({ success: false, message: 'Email ou mot de passe incorrect' });
                return;
            }
            
            // Si première connexion (pas de mot de passe)
            if (!user.mot_de_passe) {
                resolve({ 
                    success: true, 
                    firstLogin: true,
                    user: {
                        id: user.id,
                        nom: user.nom,
                        prenom: user.prenom,
                        email: user.email,
                        role: user.role
                    }
                });
                return;
            }
            
            // Vérifier le mot de passe
            const match = await bcrypt.compare(password, user.mot_de_passe);
            
            if (match) {
                resolve({ 
                    success: true,
                    firstLogin: false,
                    user: {
                        id: user.id,
                        nom: user.nom,
                        prenom: user.prenom,
                        email: user.email,
                        role: user.role
                    }
                });
            } else {
                resolve({ success: false, message: 'Email ou mot de passe incorrect' });
            }
        });
    });
});

ipcMain.handle('checkFirstLogin', async (event, userId) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT premiere_connexion FROM salaries WHERE id = ?', [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row ? row.premiere_connexion === 1 : false);
            }
        });
    });
});

ipcMain.handle('setPassword', async (event, userId, password) => {
    return new Promise(async (resolve, reject) => {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.run(
                'UPDATE salaries SET mot_de_passe = ?, premiere_connexion = 0 WHERE id = ?',
                [hashedPassword, userId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ success: true });
                    }
                }
            );
        } catch (error) {
            reject(error);
        }
    });
});

// ========== GESTION DES SALARIÉS ==========

ipcMain.handle('getSalarie', async (event, id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM salaries WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
});

ipcMain.handle('getAllSalaries', async (event) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM salaries WHERE actif = 1 ORDER BY nom, prenom', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// ========== GESTION DES SOLDES ==========

ipcMain.handle('getSoldes', async (event, salarieId, annee) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            [salarieId, annee],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
});
ipcMain.handle('updateSoldes', async (event, salarieId, annee, soldes) => {
    return new Promise((resolve, reject) => {
        // Vérifier si le solde existe déjà
        db.get(
            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            [salarieId, annee],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row) {
                    // Mettre à jour
                    db.run(
                        `UPDATE soldes 
                         SET cp_n = ?, cp_n1 = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP
                         WHERE salarie_id = ? AND annee = ?`,
                        [soldes.cp_n, soldes.cp_n1, soldes.rtt, soldes.recup_heures, salarieId, annee],
                        (err) => {
                            if (err) reject(err);
                            else resolve({ success: true });
                        }
                    );
                } else {
                    // Créer
                    db.run(
                        `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [salarieId, annee, soldes.cp_n, soldes.cp_n1, soldes.rtt, soldes.recup_heures],
                        (err) => {
                            if (err) reject(err);
                            else resolve({ success: true });
                        }
                    );
                }
            }
        );
    });
});
// ========== GESTION DES ABSENCES ==========

ipcMain.handle('getAbsences', async (event, salarieId) => {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM absences WHERE salarie_id = ? AND statut = "valide" ORDER BY date_debut DESC',
            [salarieId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
});

ipcMain.handle('getAllAbsences', async (event) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT a.*, s.nom, s.prenom 
             FROM absences a 
             JOIN salaries s ON a.salarie_id = s.id 
             WHERE a.statut = "valide" 
             ORDER BY a.date_debut DESC`,
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
});

// ========== JOURS FÉRIÉS ==========

ipcMain.handle('getJoursFeries', async (event, annee) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM jours_feries WHERE annee = ? ORDER BY date', [annee], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

// ========== CALCUL DE DURÉE ==========

ipcMain.handle('calculerDuree', async (event, dateDebut, dateFin, periodeType) => {
    return new Promise((resolve, reject) => {
        // Récupérer les jours fériés
        const anneeDebut = new Date(dateDebut).getFullYear();
        const anneeFin = new Date(dateFin).getFullYear();
        
        db.all(
            'SELECT date FROM jours_feries WHERE annee IN (?, ?)',
            [anneeDebut, anneeFin],
            (err, joursFeries) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const joursOuvres = calculerJoursOuvres(dateDebut, dateFin, joursFeries);
                
                // Appliquer le coefficient selon le type de période
                let dureeJours = joursOuvres;
                if (periodeType === 'demi') {
                    dureeJours = joursOuvres * 0.5;
                }
                
                resolve({ 
                    joursOuvres: joursOuvres,
                    dureeJours: dureeJours,
                    joursFeries: joursFeries.length
                });
            }
        );
    });
});