const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
if (require('electron-squirrel-startup')) {
  app.quit();
  return; // Arrête l'exécution si Squirrel est en train d'installer/configurer
}
let mainWindow;
let db;

// Connexion à la base de données


function connectDatabase() {
    // 1. Déterminer le chemin vers le dossier de données utilisateur (AppData)
    // C'est ici que la base doit vivre pour être modifiable
    const userDataPath = app.getPath('userData'); 
const dbPath = path.join(userDataPath, 'conges.db');

// 1. Vérifier si le dossier dans AppData existe, sinon le créer
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

// 2. Si la DB n'est pas encore dans AppData, on la copie depuis le dossier de l'app
if (!fs.existsSync(dbPath)) {
    // __dirname pointe vers l'intérieur du ASAR en production
    const templatePath = path.join(__dirname, 'conges.db'); 
    
    try {
        fs.copyFileSync(templatePath, dbPath);
        console.log("Première installation : Base de données copiée dans AppData.");
    } catch (err) {
        console.error("Erreur lors de la copie de la base :", err);
    }
}

// 3. Connexion à la base "extérieure" (celle que vous pourrez modifier)
db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Erreur de connexion SQLite :", err);
    } else {
        console.log("Base de données active : " + dbPath);
        // Migration : s'assurer que rtt_annuels a toutes les colonnes
        db.run(`CREATE TABLE IF NOT EXISTS rtt_annuels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            annee_debut INTEGER UNIQUE,
            date_debut TEXT,
            date_fin TEXT,
            nb_jours_periode INTEGER,
            nb_jours_we INTEGER,
            nb_jours_feries_hors_we INTEGER,
            nb_jours_travailles INTEGER,
            nb_cp_a_deduire INTEGER,
            nb_rtt INTEGER
        )`, () => {
            // Si la table existait déjà, ajouter les colonnes manquantes
            const cols = ['nb_jours_periode', 'nb_jours_we', 'nb_jours_feries_hors_we', 'nb_rtt'];
            cols.forEach(col => {
                db.run(`ALTER TABLE rtt_annuels ADD COLUMN ${col} INTEGER`, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                        console.error(`Migration rtt_annuels.${col}:`, err.message);
                    }
                });
            });
        });
    }
});
}

function createWindow() {
    mainWindow = new BrowserWindow({
        fullscreen: false,
        icon: path.join(__dirname, 'assets/favicon2.ico'),
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

// ========== GESTION CONFIGURATION TRAITEMENTS ==========

ipcMain.handle('getConfigTraitements', async (event) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM config_traitements ORDER BY type', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('updateConfigTraitement', async (event, type, jour, mois) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE config_traitements SET jour = ?, mois = ?, derniere_maj = CURRENT_TIMESTAMP WHERE type = ?',
            [jour, mois, type],
            (err) => {
                if (err) reject(err);
                else resolve({ success: true });
            }
        );
    });
});

ipcMain.handle('getHistoriqueTraitements', async (event) => {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM historique_traitements ORDER BY date_execution DESC LIMIT 20',
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
});

// ========== GESTION DES NOTIFICATIONS ==========

ipcMain.handle('getNotificationsNonLues', async (event, userId) => {
    return new Promise((resolve, reject) => {
        // Récupérer les notifications non lues pour cet admin (ou pour tous si user_id IS NULL)
        db.all(
            `SELECT * FROM notifications 
             WHERE lue = 0 AND (user_id IS NULL OR user_id = ?) 
             ORDER BY date_creation DESC`,
            [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
});

ipcMain.handle('marquerNotificationLue', async (event, notificationId) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE notifications SET lue = 1 WHERE id = ?',
            [notificationId],
            (err) => {
                if (err) reject(err);
                else resolve({ success: true });
            }
        );
    });
});

ipcMain.handle('creerNotification', async (event, notificationData) => {
    return new Promise((resolve, reject) => {
        const { type, titre, message, details, statut } = notificationData;
        
        db.run(
            `INSERT INTO notifications (type, titre, message, details, statut, user_id) 
             VALUES (?, ?, ?, ?, ?, NULL)`,
            [type, titre, message, details, statut],
            function(err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            }
        );
    });
});
// ========== TRAITEMENTS AUTOMATIQUES ==========

// Traitement CP Annuel (transfert + crédit)
ipcMain.handle('executerTraitementCP', async (event, annee) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM salaries WHERE actif = 1', async (err, salaries) => {
            if (err) {
                reject(err);
                return;
            }
            
            let nbMisAJour = 0;
            let details = [];
            let erreurs = [];
            
            for (const salarie of salaries) {
                try {
                    const dateEmbauche = new Date(salarie.date_embauche);
                    const anneeEmbauche = dateEmbauche.getFullYear();
                    
                    // Calculer les CP à créditer pour la nouvelle année
                    let cpNouveaux = salarie.cp_mensuel * 12; // 100% même si embauché en cours d'année précédente
                    
                    // Récupérer soldes actuels
                    const soldes = await new Promise((res, rej) => {
                        db.get(
                            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                            [salarie.id, annee],
                            (err, row) => {
                                if (err) rej(err);
                                else res(row);
                            }
                        );
                    });
                    
                    if (soldes) {
                        // Transfert CP N → CP N-1 et crédit nouveaux CP N
                        const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                        const nouveauCPN = cpNouveaux;
                        
                        await new Promise((res, rej) => {
                            db.run(
                                'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                [nouveauCPN1, nouveauCPN, salarie.id, annee],
                                (err) => {
                                    if (err) rej(err);
                                    else res();
                                }
                            );
                        });
                        
                        nbMisAJour++;
                        details.push({
                            salarie_id: salarie.id,
                            nom: `${salarie.prenom} ${salarie.nom}`,
                            cp_transferes: soldes.cp_n.toFixed(2),
                            nouveau_cp_n1: nouveauCPN1.toFixed(2),
                            nouveaux_cp_n: nouveauCPN.toFixed(2)
                        });
                    }
                    
                } catch (error) {
                    console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                    erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                }
            }
            
            // Enregistrer dans l'historique
            const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';
            
            db.run(
                'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                (err) => {
                    if (err) console.error('Erreur enregistrement historique:', err);
                }
            );

            // Sauvegarder la notification en DB
            const notifTitreCP = statut === 'success' ? 'Traitement CP Annuel effectué' : (statut === 'partial' ? 'Traitement CP Annuel partiel' : 'Erreur traitement CP Annuel');
            const notifMessageCP = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
            db.run(
                `INSERT INTO notifications (type, titre, message, statut) VALUES ('traitement', ?, ?, ?)`,
                [notifTitreCP, notifMessageCP, statut]
            );

            resolve({
                success: statut !== 'error',
                statut,
                nbMisAJour,
                details,
                erreurs
            });
        });
    });
});
// ========== SUPPRESSION D'ABSENCE AVEC RECALCUL ==========

ipcMain.handle('deleteAbsence', async (event, absenceId) => {
    return new Promise((resolve, reject) => {
        // 1. Récupérer l'absence avant de la supprimer
        db.get('SELECT * FROM absences WHERE id = ?', [absenceId], async (err, absence) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!absence) {
                reject(new Error('Absence introuvable'));
                return;
            }
            
            const salarieId = absence.salarie_id;
            const type = absence.type;
            const dureeJours = absence.duree_jours || 0;
            const dureeHeures = absence.duree_heures || 0;
            
            // CORRECTION ICI : Toujours utiliser l'année en cours pour les soldes
            const anneeEnCours = new Date().getFullYear();
            
            try {
                // 2. Supprimer l'absence
                await new Promise((res, rej) => {
                    db.run('DELETE FROM absences WHERE id = ?', [absenceId], (err) => {
                        if (err) rej(err);
                        else res();
                    });
                });
                
                // 3. Recréditer les soldes de l'année en cours si ce n'est pas une maladie
                if (type !== 'MALADIE') {
                    await new Promise((res, rej) => {
                        db.get(
                            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                            [salarieId, anneeEnCours],
                            (err, soldes) => {
                                if (err) {
                                    rej(err);
                                    return;
                                }
                                
                                if (!soldes) {
                                    rej(new Error('Soldes introuvables pour l\'année en cours'));
                                    return;
                                }
                                
                                // Recréditer selon le type
                                let nouveauCPN1 = soldes.cp_n1;
                                let nouveauCPN = soldes.cp_n;
                                let nouveauRTT = soldes.rtt;
                                let nouvelleRecup = soldes.recup_heures;
                                
                                if (type === 'CP_N' || type === 'CP_N1' || type === 'CP') {
                                    // Recréditer en priorité sur cp_n1 (miroir de la déduction)
                                    nouveauCPN1 = soldes.cp_n1 + dureeJours;
                                } else if (type === 'RTT') {
                                    nouveauRTT = soldes.rtt + dureeJours;
                                } else if (type === 'RECUP') {
                                    nouvelleRecup = soldes.recup_heures + dureeHeures;
                                }
                                
                                // Mettre à jour
                                db.run(
                                    `UPDATE soldes 
                                     SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP 
                                     WHERE salarie_id = ? AND annee = ?`,
                                    [nouveauCPN1, nouveauCPN, nouveauRTT, nouvelleRecup, salarieId, anneeEnCours],
                                    (err) => {
                                        if (err) rej(err);
                                        else res();
                                    }
                                );
                            }
                        );
                    });
                }
                
                resolve({ 
                    success: true, 
                    absence,
                    message: 'Absence supprimée et soldes recalculés'
                });
                
            } catch (error) {
                reject(error);
            }
        });
    });
});


// Modifier une absence
ipcMain.handle('updateAbsence', async (event, absenceId, updates) => {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];
        
        if (updates.date_debut !== undefined) {
            fields.push('date_debut = ?');
            values.push(updates.date_debut);
        }
        if (updates.date_fin !== undefined) {
            fields.push('date_fin = ?');
            values.push(updates.date_fin);
        }
        if (updates.duree_jours !== undefined) {
            fields.push('duree_jours = ?');
            values.push(updates.duree_jours);
        }
        if (updates.duree_heures !== undefined) {
            fields.push('duree_heures = ?');
            values.push(updates.duree_heures);
        }
        
        values.push(absenceId);
        
        const sql = `UPDATE absences SET ${fields.join(', ')} WHERE id = ?`;
        
        db.run(sql, values, (err) => {
            if (err) reject(err);
            else resolve({ success: true });
        });
    });
});
// Traitement RTT Annuel
ipcMain.handle('executerTraitementRTT', async (event, annee) => {
    return new Promise((resolve, reject) => {
        console.log('🔍 Recherche RTT pour annee:', annee, 'type:', typeof annee);
        db.get('SELECT * FROM rtt_annuels WHERE annee_debut = ?', [annee], async (err, rttAnnuel) => {
            console.log('🔍 Erreur DB:', err);
            console.log('🔍 Résultat DB:', rttAnnuel);
            if (err) {
                reject(err);
                return;
            }
            
            if (!rttAnnuel) {
                reject(new Error(`Aucun paramètre RTT configuré pour l'année ${annee}. Rendez-vous dans Planning des traitements pour les renseigner.`));
                return;
            }
            
            const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);
            
            db.all('SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1', async (err, salaries) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                let nbMisAJour = 0;
                let details = [];
                let erreurs = [];
                
                for (const salarie of salaries) {
                    try {
                        const dateEmbauche = new Date(salarie.date_embauche);
                        const anneeEmbauche = dateEmbauche.getFullYear();
                        
                        let rttAjouter = nbRTT;
                        
                        // Prorata si embauché en cours d'année
                        if (anneeEmbauche === annee) {
                            const dateDebut = new Date(annee, 0, 1);
                            const dateFin = new Date(annee, 11, 31);
                            const joursAnneeTravailles = Math.ceil((dateFin - dateEmbauche) / (1000 * 60 * 60 * 24));
                            const joursAnnee = Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24));
                            rttAjouter = (nbRTT * joursAnneeTravailles) / joursAnnee;
                        }
                        
                        const soldes = await new Promise((res, rej) => {
                            db.get(
                                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                [salarie.id, annee],
                                (err, row) => {
                                    if (err) rej(err);
                                    else res(row);
                                }
                            );
                        });
                        
                        if (soldes) {
                            const nouveauRTT = soldes.rtt + rttAjouter;
                            
                            await new Promise((res, rej) => {
                                db.run(
                                    'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                    [nouveauRTT, salarie.id, annee],
                                    (err) => {
                                        if (err) rej(err);
                                        else res();
                                    }
                                );
                            });
                            
                            nbMisAJour++;
                            details.push({
                                salarie_id: salarie.id,
                                nom: `${salarie.prenom} ${salarie.nom}`,
                                rtt_ajoutes: rttAjouter.toFixed(2),
                                nouveau_solde: nouveauRTT.toFixed(2)
                            });
                        }
                        
                    } catch (error) {
                        console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                        erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                    }
                }
                
                const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';
                
                db.run(
                    'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                    ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                    (err) => {
                        if (err) console.error('Erreur enregistrement historique:', err);
                    }
                );

                // Sauvegarder la notification en DB
                const notifTitreRTT = statut === 'success' ? 'Traitement RTT Annuel effectué' : (statut === 'partial' ? 'Traitement RTT Annuel partiel' : 'Erreur traitement RTT Annuel');
                const notifMessageRTT = nbMisAJour > 0 ? `${nbMisAJour} salarié(s) traité(s) avec succès` : (erreurs.join(', ') || 'Aucun salarié traité');
                db.run(
                    `INSERT INTO notifications (type, titre, message, statut) VALUES ('traitement', ?, ?, ?)`,
                    [notifTitreRTT, notifMessageRTT, statut]
                );

                resolve({
                    success: statut !== 'error',
                    statut,
                    nbMisAJour,
                    details,
                    erreurs
                });
            });
        });
    });
});

// ========== VÉRIFICATION AUTOMATIQUE DES TRAITEMENTS ==========

async function verifierTraitementsAutomatiques() {
    console.log('🔍 Vérification des traitements automatiques...');
    
    const aujourdhui = new Date();
    const annee = aujourdhui.getFullYear();
    const mois = aujourdhui.getMonth() + 1; // 1-12
    const jour = aujourdhui.getDate();
    
    try {
        // Récupérer la configuration
        const config = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM config_traitements WHERE actif = 1', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        for (const conf of config) {
            // Vérifier si on est à la date de traitement
            if (conf.jour === jour && conf.mois === mois) {
                console.log(`📅 Date de traitement ${conf.type} atteinte !`);
                
                // Vérifier si déjà fait cette année
                const dejaFait = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT * FROM historique_traitements WHERE type = ? AND annee = ? AND statut = "success"',
                        [conf.type, annee],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                
                if (!dejaFait) {
                    console.log(`✅ Exécution du traitement ${conf.type}...`);
                    
                    // Exécuter le traitement
                    if (conf.type === 'CP_ANNUEL') {
                        await executerTraitementCPAuto(annee);
                    } else if (conf.type === 'RTT_ANNUEL') {
                        await executerTraitementRTTAuto(annee);
                    }
                } else {
                    console.log(`⏭️ Traitement ${conf.type} déjà effectué cette année`);
                }
            }
        }
        
        // Vérifier si les RTT de l'année suivante ne sont toujours pas configurés (rappel 1 mois après traitement)
        const rttConfig = config.find(c => c.type === 'RTT_ANNUEL');
        if (rttConfig) {
            // Calculer la date 1 mois après le traitement RTT
            let moisRappel = rttConfig.mois + 1;
            let anneeRappel = annee;
            if (moisRappel > 12) { moisRappel = 1; anneeRappel++; }

            if (mois === moisRappel && jour === rttConfig.jour) {
                // Vérifier si le traitement RTT de cette année a bien eu lieu
                const traitementFait = await new Promise((res, rej) => {
                    db.get('SELECT * FROM historique_traitements WHERE type = "RTT_ANNUEL" AND annee = ? AND statut = "success"',
                        [annee], (err, row) => { if (err) rej(err); else res(row); });
                });

                if (traitementFait) {
                    // Vérifier si les RTT N+1 sont toujours pas configurés
                    const rttNextYear = await new Promise((res, rej) => {
                        db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee + 1],
                            (err, row) => { if (err) rej(err); else res(row); });
                    });

                    if (!rttNextYear) {
                        // Vérifier qu'on n'a pas déjà envoyé ce rappel (éviter les doublons)
                        const dejaNotifie = await new Promise((res, rej) => {
                            db.get(`SELECT id FROM notifications WHERE type = 'error' AND titre = 'Paramètres RTT manquants'
                                    AND message LIKE '%${annee + 1}%' AND date_creation > datetime('now', '-30 days')`,
                                (err, row) => { if (err) rej(err); else res(row); });
                        });

                        if (!dejaNotifie) {
                            const admins = await new Promise((res, rej) => {
                                db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1",
                                    (err, rows) => { if (err) rej(err); else res(rows || []); });
                            });
                            admins.forEach(admin => {
                                db.run(
                                    'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                    [admin.id, 'error', 'Paramètres RTT manquants',
                                     `Les paramètres RTT pour ${annee + 1} ne sont toujours pas configurés (rappel 1 mois après traitement). Le prochain traitement RTT échouera sans ces paramètres.`]
                                );
                            });
                            console.log(`⚠️ Rappel envoyé : RTT ${annee + 1} non configurés`);
                        }
                    }
                }
            }
        }

    } catch (error) {
        console.error('❌ Erreur vérification traitements:', error);
    }
}

// Fonction pour exécuter le traitement CP automatiquement
async function executerTraitementCPAuto(annee) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM salaries WHERE actif = 1', async (err, salaries) => {
            if (err) {
                console.error('Erreur récupération salariés:', err);
                reject(err);
                return;
            }
            
            let nbMisAJour = 0;
            let details = [];
            let erreurs = [];
            
            for (const salarie of salaries) {
                try {
                    const cpNouveaux = salarie.cp_mensuel * 12;
                    
                    const soldes = await new Promise((res, rej) => {
                        db.get(
                            'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                            [salarie.id, annee],
                            (err, row) => {
                                if (err) rej(err);
                                else res(row);
                            }
                        );
                    });
                    
                    if (soldes) {
                        const nouveauCPN1 = soldes.cp_n1 + soldes.cp_n;
                        const nouveauCPN = cpNouveaux;
                        
                        await new Promise((res, rej) => {
                            db.run(
                                'UPDATE soldes SET cp_n1 = ?, cp_n = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                [nouveauCPN1, nouveauCPN, salarie.id, annee],
                                (err) => {
                                    if (err) rej(err);
                                    else res();
                                }
                            );
                        });
                        
                        nbMisAJour++;
                        details.push({
                            salarie_id: salarie.id,
                            nom: `${salarie.prenom} ${salarie.nom}`,
                            cp_transferes: soldes.cp_n.toFixed(2),
                            nouveau_cp_n1: nouveauCPN1.toFixed(2),
                            nouveaux_cp_n: nouveauCPN.toFixed(2)
                        });
                    }
                } catch (error) {
                    console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                    erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                }
            }
            
            const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';
            
            // Enregistrer dans l'historique
            db.run(
                'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                ['CP_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                (err) => {
                    if (err) console.error('Erreur enregistrement historique:', err);
                }
            );
            
            // Envoyer notification au renderer
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('traitement-automatique', {
                    type: 'CP_ANNUEL',
                    statut,
                    nbSalaries: nbMisAJour,
                    details,
                    erreurs
                });
            }
            
            console.log(`✅ Traitement CP terminé: ${nbMisAJour} salariés traités`);
            resolve({ success: statut !== 'error', nbMisAJour, statut });
        });
    });
}

// Fonction pour exécuter le traitement RTT automatiquement
async function executerTraitementRTTAuto(annee) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM rtt_annuels WHERE annee_debut = ?', [annee], async (err, rttAnnuel) => {
            if (err) {
                console.error('Erreur récupération RTT:', err);
                reject(err);
                return;
            }
            
            if (!rttAnnuel) {
                console.error(`Aucun paramètre RTT pour ${annee}`);
                // Notifier tous les admins
                db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1", (err2, admins) => {
                    if (!err2 && admins) {
                        admins.forEach(admin => {
                            db.run(
                                'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                [admin.id, 'warning', 'Traitement RTT impossible',
                                 `Les paramètres RTT pour l'année ${annee} ne sont pas configurés. Rendez-vous dans Planning des traitements pour les renseigner.`]
                            );
                        });
                    }
                });
                reject(new Error(`Aucun paramètre RTT pour ${annee}`));
                return;
            }
            
            const nbRTT = rttAnnuel.nb_rtt != null ? rttAnnuel.nb_rtt : (rttAnnuel.nb_jours_travailles - rttAnnuel.nb_cp_a_deduire);
            
            db.all('SELECT * FROM salaries WHERE actif = 1 AND a_droit_rtt = 1', async (err, salaries) => {
                if (err) {
                    console.error('Erreur récupération salariés RTT:', err);
                    reject(err);
                    return;
                }
                
                let nbMisAJour = 0;
                let details = [];
                let erreurs = [];
                
                for (const salarie of salaries) {
                    try {
                        const dateEmbauche = new Date(salarie.date_embauche);
                        const anneeEmbauche = dateEmbauche.getFullYear();
                        
                        let rttAjouter = nbRTT;
                        
                        if (anneeEmbauche === annee) {
                            const dateDebut = new Date(annee, 0, 1);
                            const dateFin = new Date(annee, 11, 31);
                            const joursAnneeTravailles = Math.ceil((dateFin - dateEmbauche) / (1000 * 60 * 60 * 24));
                            const joursAnnee = Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24));
                            rttAjouter = (nbRTT * joursAnneeTravailles) / joursAnnee;
                        }
                        
                        const soldes = await new Promise((res, rej) => {
                            db.get(
                                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                                [salarie.id, annee],
                                (err, row) => {
                                    if (err) rej(err);
                                    else res(row);
                                }
                            );
                        });
                        
                        if (soldes) {
                            const nouveauRTT = soldes.rtt + rttAjouter;
                            
                            await new Promise((res, rej) => {
                                db.run(
                                    'UPDATE soldes SET rtt = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?',
                                    [nouveauRTT, salarie.id, annee],
                                    (err) => {
                                        if (err) rej(err);
                                        else res();
                                    }
                                );
                            });
                            
                            nbMisAJour++;
                            details.push({
                                salarie_id: salarie.id,
                                nom: `${salarie.prenom} ${salarie.nom}`,
                                rtt_ajoutes: rttAjouter.toFixed(2),
                                nouveau_solde: nouveauRTT.toFixed(2)
                            });
                        }
                    } catch (error) {
                        console.error(`Erreur pour ${salarie.prenom} ${salarie.nom}:`, error);
                        erreurs.push(`${salarie.prenom} ${salarie.nom}: ${error.message}`);
                    }
                }
                
                const statut = erreurs.length > 0 ? (nbMisAJour > 0 ? 'partial' : 'error') : 'success';
                
                db.run(
                    'INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut, message_erreur) VALUES (?, ?, ?, ?, ?, ?)',
                    ['RTT_ANNUEL', annee, nbMisAJour, JSON.stringify(details), statut, erreurs.join('; ') || null],
                    (err) => {
                        if (err) console.error('Erreur enregistrement historique:', err);
                    }
                );
                
                // Envoyer notification au renderer
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('traitement-automatique', {
                        type: 'RTT_ANNUEL',
                        statut,
                        nbSalaries: nbMisAJour,
                        details,
                        erreurs
                    });
                }
                
                console.log(`✅ Traitement RTT terminé: ${nbMisAJour} salariés traités`);

                // Vérifier si les RTT sont configurés pour l'année suivante
                db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee + 1], (err3, nextYear) => {
                    if (!err3 && !nextYear) {
                        db.all("SELECT id FROM salaries WHERE role = 'admin' AND actif = 1", (err4, admins) => {
                            if (!err4 && admins) {
                                admins.forEach(admin => {
                                    db.run(
                                        'INSERT INTO notifications (user_id, type, titre, message, date_creation, lue) VALUES (?, ?, ?, ?, datetime("now"), 0)',
                                        [admin.id, 'info', 'Paramètres RTT à configurer',
                                         `Le traitement RTT ${annee} s'est bien déroulé. Pensez à configurer les paramètres RTT pour ${annee + 1} dans Planning des traitements.`]
                                    );
                                });
                            }
                        });
                    }
                });

                resolve({ success: statut !== 'error', nbMisAJour, statut });
            });
        });
    });
}

app.whenReady().then(() => {
    connectDatabase();
    createWindow();
    
    // Vérifier les traitements automatiques après création de la fenêtre
    setTimeout(() => {
        verifierTraitementsAutomatiques();
    }, 2000); // Attendre 2 secondes que l'app soit bien lancée

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

                    // Notification absence
                    const anneeAbsence = new Date(date_debut).getFullYear();
                    db.get('SELECT nom, prenom FROM salaries WHERE id = ?', [salarie_id], (err2, salarie) => {
                        if (err2 || !salarie) return;
                        db.get('SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?', [salarie_id, anneeAbsence], (err3, soldes) => {
                            const formatDate = (d) => { const [y, m, j] = d.split('-'); return `${j}/${m}`; };
                            const labels = { CP_N: 'CP', CP_N1: 'CP', CP: 'CP', RTT: 'RTT', RECUP: 'Récup', MALADIE: 'Maladie' };
                            const typeLabel = labels[type] || type;
                            const dureeStr = (type === 'RECUP' && !duree_jours) ? `${duree_heures}h` : `${duree_jours}j`;

                            let soldeStr = '';
                            if (soldes && type !== 'MALADIE') {
                                if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                                    const restant = (soldes.cp_n1 + soldes.cp_n) - (duree_jours || 0);
                                    soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}j`;
                                } else if (type === 'RTT') {
                                    const restant = soldes.rtt - (duree_jours || 0);
                                    soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}j`;
                                } else if (type === 'RECUP') {
                                    const restant = soldes.recup_heures - (duree_heures || 0);
                                    soldeStr = ` · Solde restant : ${restant % 1 === 0 ? restant : restant.toFixed(1)}h`;
                                }
                            }

                            const titre = `Absence posée — ${salarie.prenom} ${salarie.nom}`;
                            const message = `${typeLabel} · du ${formatDate(date_debut)} au ${formatDate(date_fin)} (${dureeStr})${soldeStr}`;
                            db.run(
                                `INSERT INTO notifications (type, titre, message, statut) VALUES ('absence', ?, ?, 'success')`,
                                [titre, message]
                            );
                        });
                    });
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
// ========== AJOUT HEURES SUPPLÉMENTAIRES ==========

ipcMain.handle('ajouter-recup', async (event, data) => {
    const { salarie_id, annee, heures } = data;
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE soldes SET recup_heures = recup_heures + ?, derniere_maj = CURRENT_TIMESTAMP
             WHERE salarie_id = ? AND annee = ?`,
            [heures, salarie_id, annee],
            (err) => {
                if (err) {
                    console.error('Erreur ajout heures sup:', err);
                    reject(err);
                } else {
                    resolve({ success: true });
                }
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
                // Ouvrir le PDF généré
                shell.openPath(filePath).then(() => {
                    console.log('PDF ouvert:', filePath);
                });
    
                // Proposer l'enregistrement via dialogue
                const { dialog } = require('electron');
                
                setTimeout(() => {
                    dialog.showSaveDialog(mainWindow, {
                    title: 'Enregistrer ou imprimer le PDF',
                    defaultPath: path.join(require('os').homedir(), 'Documents', fileName),
                    filters: [{ name: 'PDF', extensions: ['pdf'] }]
                    }).then(result => {
                        if (!result.canceled && result.filePath) {
                            fs.copyFileSync(filePath, result.filePath);
                            console.log('PDF sauvegardé à:', result.filePath);
                            // Ouvrir le PDF sauvegardé
                            shell.openPath(result.filePath);
                        }
                    });
                }, 500); // Petit délai pour que le premier PDF s'ouvre d'abord
    
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

ipcMain.handle('addJourFerie', async (event, data) => {
    return new Promise((resolve, reject) => {
        const { date, libelle, annee } = data;
        db.run(
            'INSERT INTO jours_feries (date, libelle, annee) VALUES (?, ?, ?)',
            [date, libelle, annee],
            function(err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            }
        );
    });
});

ipcMain.handle('deleteJourFerie', async (event, id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM jours_feries WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve({ success: true });
        });
    });
});

// ========== RTT ANNUELS ==========

ipcMain.handle('getRTTAnnuels', async (event) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM rtt_annuels ORDER BY annee_debut DESC', (err, rows) => {
            if (err) reject(err);
            else {
                console.log('📖 getRTTAnnuels:', JSON.stringify(rows));
                resolve(rows);
            }
        });
    });
});

ipcMain.handle('addRTTAnnuel', async (event, data) => {
    return new Promise((resolve, reject) => {
        console.log('📝 addRTTAnnuel reçu:', JSON.stringify(data));
        const { annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt } = data;
        db.get('SELECT id FROM rtt_annuels WHERE annee_debut = ?', [annee_debut], (err, row) => {
            if (err) { reject(err); return; }
            if (row) {
                db.run(
                    `UPDATE rtt_annuels SET date_debut = ?, date_fin = ?, nb_jours_travailles = ?, nb_cp_a_deduire = ?,
                     nb_jours_periode = ?, nb_jours_we = ?, nb_jours_feries_hors_we = ?, nb_rtt = ? WHERE annee_debut = ?`,
                    [date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt, annee_debut],
                    (err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    }
                );
            } else {
                db.run(
                    `INSERT INTO rtt_annuels (annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire,
                     nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [annee_debut, date_debut, date_fin, nb_jours_travailles, nb_cp_a_deduire, nb_jours_periode, nb_jours_we, nb_jours_feries_hors_we, nb_rtt],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ success: true, id: this.lastID });
                    }
                );
            }
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