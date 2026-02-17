const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');

const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
        fullscreen: false,
        icon: path.join(__dirname, 'assets/logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'pages', 'login.html'));
    
    // Maximiser la fenêtre au démarrage (s'adapte à la taille de l'écran)
    mainWindow.maximize();
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
    console.log('=== CALCUL JOURS OUVRES ===');
    console.log('dateDebut reçu:', dateDebut);
    console.log('dateFin reçu:', dateFin);
    
    let joursOuvres = 0;
    
    // Convertir les jours fériés en Set pour recherche rapide
    const feriesSet = new Set(joursFeries.map(f => f.date));
    
    // Parser les dates
    const [anneeD, moisD, jourD] = dateDebut.split('-').map(Number);
    const [anneeF, moisF, jourF] = dateFin.split('-').map(Number);
    
    // Créer des dates à midi pour éviter les problèmes de fuseau
    let currentDate = new Date(Date.UTC(anneeD, moisD - 1, jourD, 12, 0, 0));
    const endDate = new Date(Date.UTC(anneeF, moisF - 1, jourF, 12, 0, 0));
    
    while (currentDate <= endDate) {
        // Utiliser les méthodes UTC pour éviter les décalages
        const year = currentDate.getUTCFullYear();
        const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getUTCDate()).padStart(2, '0');
        const dateISO = `${year}-${month}-${day}`;
        const dayOfWeek = currentDate.getUTCDay();
        
        console.log(`Jour: ${dateISO}, dayOfWeek: ${dayOfWeek}, férié: ${feriesSet.has(dateISO)}`);
        
        // Exclure samedi (6) et dimanche (0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Exclure les jours fériés
            if (!feriesSet.has(dateISO)) {
                joursOuvres++;
            }
        }
        
        // Passer au jour suivant
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    
    console.log('Total jours ouvrés:', joursOuvres);
    
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
// ========== CRÉATION D'ABSENCE ==========

ipcMain.handle('createAbsence', async (event, absenceData) => {
    return new Promise((resolve, reject) => {
        const { salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire } = absenceData;
        
        db.run(
            `INSERT INTO absences (salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, statut, commentaire)
             VALUES (?, ?, ?, ?, ?, ?, 'valide', ?)`,
            [salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire],
            function(err) {
                if (err) {
                    console.error('Erreur création absence:', err);
                    reject(err);
                } else {
                    console.log('Absence créée avec ID:', this.lastID);
                    resolve({ success: true, id: this.lastID });
                }
            }
        );
    });
});

// ========== MISE À JOUR DES SOLDES APRÈS ABSENCE ==========

ipcMain.handle('updateSoldesAfterAbsence', async (event, salarieId, annee, type, dureeJours, dureeHeures) => {
    return new Promise((resolve, reject) => {
        // Récupérer les soldes actuels
        db.get(
            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            [salarieId, annee],
            (err, soldes) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!soldes) {
                    resolve({ success: false, message: 'Soldes non trouvés' });
                    return;
                }
                
                // Calculer les nouveaux soldes selon le type
                let nouveauCP_N1 = soldes.cp_n1;
                let nouveauCP_N = soldes.cp_n;
                let nouveauRTT = soldes.rtt;
                let nouveauRecup = soldes.recup_heures;
                
                if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                    // Déduire d'abord CP N-1, puis CP N
                    if (soldes.cp_n1 >= dureeJours) {
                        nouveauCP_N1 = soldes.cp_n1 - dureeJours;
                    } else {
                        const resteADeduire = dureeJours - soldes.cp_n1;
                        nouveauCP_N1 = 0;
                        nouveauCP_N = soldes.cp_n - resteADeduire;
                    }
                } else if (type === 'RTT') {
                    nouveauRTT = soldes.rtt - dureeJours;
                } else if (type === 'RECUP') {
                    nouveauRecup = soldes.recup_heures - dureeHeures;
                }
                // MALADIE ne déduit rien
                
                // Mettre à jour les soldes
                db.run(
                    `UPDATE soldes 
                     SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP
                     WHERE salarie_id = ? AND annee = ?`,
                    [nouveauCP_N1, nouveauCP_N, nouveauRTT, nouveauRecup, salarieId, annee],
                    (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ 
                                success: true,
                                nouveaux_soldes: {
                                    cp_n1: nouveauCP_N1,
                                    cp_n: nouveauCP_N,
                                    rtt: nouveauRTT,
                                    recup_heures: nouveauRecup
                                }
                            });
                        }
                    }
                );
            }
        );
    });
});
// ========== GÉNÉRATION PDF ==========
ipcMain.handle('genererPDF', async (event, absenceData) => {
    return new Promise((resolve, reject) => {
        try {
            const { salarie, absence, soldes } = absenceData;
            
            // Créer un nom de fichier unique
            const fileName = `demande_conges_${salarie.nom}_${salarie.prenom}_${Date.now()}.pdf`;
            const filePath = path.join(os.tmpdir(), fileName);
            
            // Créer le document PDF (A4)
            const doc = new PDFDocument({ 
                size: 'A4',
                margin: 50 
            });
            const stream = fs.createWriteStream(filePath);
            
            doc.pipe(stream);
            
            // Couleurs de l'asso
            const bleu = '#006C89';
            const orange = '#ED7111';
            
            // En-tête avec fond coloré
            doc.rect(0, 0, doc.page.width, 100)
               .fill(bleu);
            
            doc.fillColor('white')
               .fontSize(24)
               .font('Helvetica-Bold')
               .text('DEMANDE DE CONGÉS', 50, 35, { align: 'center' })
               .fontSize(10)
               .font('Helvetica')
               .text('La Ciotat Entreprendre', 50, 65, { align: 'center' });
            
            // Retour à noir pour le contenu
            doc.fillColor('black');
            
            // Espacement
            doc.moveDown(4);
            
            // Cadre informations salarié
            const yStart = doc.y;
            doc.rect(50, yStart, doc.page.width - 100, 80)
               .lineWidth(1)
               .stroke(bleu);
            
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor(bleu)
               .text('INFORMATIONS DU SALARIÉ', 60, yStart + 10);
            
            doc.fontSize(11)
               .font('Helvetica')
               .fillColor('black')
               .text(`Nom : ${salarie.nom.toUpperCase()}`, 60, yStart + 35)
               .text(`Prénom : ${salarie.prenom}`, 60, yStart + 55);
            
            doc.moveDown(3);
            
            // Cadre période de congés
            const yPeriode = doc.y;
            doc.rect(50, yPeriode, doc.page.width - 100, 150)
               .lineWidth(1)
               .stroke(orange);
            
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor(orange)
               .text('PÉRIODE DE CONGÉS', 60, yPeriode + 10);
            
            // Type d'absence
            const typeLabels = {
                'CP': 'Congés Payés',
                'CP_N': 'Congés Payés (année en cours)',
                'CP_N1': 'Congés Payés (année précédente)',
                'RTT': 'RTT',
                'RECUP': 'Récupération',
                'MALADIE': 'Arrêt Maladie'
            };
            
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('black')
               .text('Type de congé : ', 60, yPeriode + 40, { continued: true })
               .font('Helvetica')
               .text(typeLabels[absence.type] || absence.type);
            
            // Dates
            const dateD = new Date(absence.date_debut).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const dateF = new Date(absence.date_fin).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            doc.font('Helvetica-Bold')
               .text('Du : ', 60, yPeriode + 65, { continued: true })
               .font('Helvetica')
               .text(dateD);
            
            doc.font('Helvetica-Bold')
               .text('Au : ', 60, yPeriode + 85, { continued: true })
               .font('Helvetica')
               .text(dateF);
            
            // Durée
            doc.font('Helvetica-Bold')
               .text('Durée : ', 60, yPeriode + 110, { continued: true })
               .font('Helvetica');
            
            if (absence.duree_jours) {
                doc.text(`${absence.duree_jours.toFixed(2)} jour(s)`);
            } else if (absence.duree_heures) {
                doc.text(`${absence.duree_heures.toFixed(1)} heure(s)`);
            }
            
            doc.moveDown(3);
            
            // Tableau des soldes
            const ySoldes = doc.y;
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor(bleu)
               .text('SOLDES APRÈS DÉDUCTION', 60, ySoldes);
            
            doc.moveDown(0.5);
            
            // Tableau
            const tableTop = doc.y;
            const col1 = 60;
            const col2 = 250;
            const rowHeight = 25;
            
            // En-tête tableau
            doc.rect(col1, tableTop, doc.page.width - 120, rowHeight)
               .fill(bleu);
            
            doc.fillColor('white')
               .fontSize(10)
               .font('Helvetica-Bold')
               .text('Type de congé', col1 + 10, tableTop + 8)
               .text('Solde restant', col2, tableTop + 8);
            
            doc.fillColor('black');
            
            // Lignes du tableau
            const soldesData = [
                ['CP N-1', `${soldes.cp_n1.toFixed(2)} jours`],
                ['CP N', `${soldes.cp_n.toFixed(2)} jours`],
                ['RTT', `${soldes.rtt.toFixed(2)} jours`],
                ['Récupération', `${soldes.recup_heures.toFixed(1)} heures`]
            ];
            
            soldesData.forEach((row, i) => {
                const y = tableTop + rowHeight + (i * rowHeight);
                
                // Fond alterné
                if (i % 2 === 0) {
                    doc.rect(col1, y, doc.page.width - 120, rowHeight)
                       .fill('#f5f5f5');
                }
                
                doc.fillColor('black')
                   .fontSize(10)
                   .font('Helvetica')
                   .text(row[0], col1 + 10, y + 8)
                   .font('Helvetica-Bold')
                   .text(row[1], col2, y + 8);
            });
            
            // Commentaire si présent
            if (absence.commentaire) {
                doc.moveDown(3);
                doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .fillColor('black')
                   .text('Commentaire : ')
                   .moveDown(0.3)
                   .font('Helvetica')
                   .fontSize(10)
                   .text(absence.commentaire, { width: doc.page.width - 100 });
            }
            
            // Signatures
            const ySign = doc.page.height - 180;
            
            doc.moveTo(50, ySign).lineTo(doc.page.width - 50, ySign).stroke();
            
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .text('Signature du salarié', 60, ySign + 20)
               .text('Signature du responsable', 340, ySign + 20);
            
            doc.fontSize(9)
               .font('Helvetica')
               .text('Date : _______________', 60, ySign + 80)
               .text('Date : _______________', 340, ySign + 80);
            
            // Pied de page
            // doc.fontSize(8)
            //    .fillColor('#999')
            //    .text(`Document généré le ${new Date().toLocaleString('fr-FR')}`, 50, doc.page.height - 30, {
            //        align: 'center',
            //        width: doc.page.width - 100
            //    });
            
            doc.end();
            
            stream.on('finish', () => {
                // Ouvrir automatiquement le PDF pour impression
                shell.openPath(filePath).then(() => {
                    console.log('PDF ouvert pour impression:', filePath);
                });
                
                resolve({ success: true, filePath });
            });
            
            stream.on('error', (err) => {
                reject(err);
            });
            
        } catch (error) {
            reject(error);
        }
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
// ========== GESTION DES SALARIÉS (ADMIN) ==========

// Créer un nouveau salarié
ipcMain.handle('createSalarie', async (event, salarieData) => {
    return new Promise((resolve, reject) => {
        const { nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup } = salarieData;
        
        db.run(
            `INSERT INTO salaries (nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, role, actif, premiere_connexion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'utilisateur', 1, 1)`,
            [nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup],
            function(err) {
                if (err) {
                    console.error('Erreur création salarié:', err);
                    reject(err);
                } else {
                    console.log('Salarié créé avec ID:', this.lastID);
                    
                    // Créer les soldes pour l'année en cours
                    const annee = new Date().getFullYear();
                    db.run(
                        `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures)
                         VALUES (?, ?, 0, 0, 0, 0)`,
                        [this.lastID, annee],
                        (errSoldes) => {
                            if (errSoldes) {
                                console.error('Erreur création soldes:', errSoldes);
                            }
                        }
                    );
                    
                    resolve({ success: true, id: this.lastID });
                }
            }
        );
    });
});

// Modifier un salarié
ipcMain.handle('updateSalarie', async (event, salarieId, salarieData) => {
    return new Promise((resolve, reject) => {
        const { nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup } = salarieData;
        
        db.run(
            `UPDATE salaries 
             SET nom = ?, prenom = ?, email = ?, date_embauche = ?, type_contrat = ?, 
                 cp_mensuel = ?, a_droit_rtt = ?, a_droit_recup = ?
             WHERE id = ?`,
            [nom, prenom, email, date_embauche, type_contrat, cp_mensuel, a_droit_rtt, a_droit_recup, salarieId],
            function(err) {
                if (err) {
                    console.error('Erreur modification salarié:', err);
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            }
        );
    });
});

// Désactiver un salarié (ne pas supprimer pour garder l'historique)
ipcMain.handle('deactivateSalarie', async (event, salarieId) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE salaries SET actif = 0 WHERE id = ?',
            [salarieId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            }
        );
    });
});

// Réinitialiser le mot de passe d'un salarié
ipcMain.handle('resetPassword', async (event, salarieId) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE salaries SET mot_de_passe = NULL, premiere_connexion = 1 WHERE id = ?',
            [salarieId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            }
        );
    });
});