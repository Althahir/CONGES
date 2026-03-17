module.exports = function registerAbsencesHandlers(ctx, safeHandle) {

    safeHandle('getAbsences', async (event, salarieId) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
                'SELECT * FROM absences WHERE salarie_id = ? AND statut = "valide" ORDER BY date_debut DESC',
                [salarieId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    });

    safeHandle('getAllAbsences', async (event) => {
        return new Promise((resolve, reject) => {
            ctx.db.all(
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

    safeHandle('createAbsence', async (event, absenceData) => {
        const { salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire, debut_periode, fin_periode, skipNotification } = absenceData;

        // 1. Insérer l'absence
        const result = await new Promise((resolve, reject) => {
            ctx.db.run(
                `INSERT INTO absences (salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, statut, commentaire, debut_periode, fin_periode)
                 VALUES (?, ?, ?, ?, ?, ?, 'valide', ?, ?, ?)`,
                [salarie_id, type, date_debut, date_fin, duree_jours, duree_heures, commentaire, debut_periode || 'journee-complete', fin_periode || 'journee-complete'],
                function(err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                }
            );
        });

        console.log('Absence créée avec ID:', result.id);

        // 2. Créer la notification (dans le même verrou)
        if (!skipNotification) {
            try {
                const salarie = await new Promise((resolve, reject) => {
                    ctx.db.get('SELECT nom, prenom FROM salaries WHERE id = ?', [salarie_id], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (salarie) {
                    const anneeAbsence = new Date(date_debut).getFullYear();
                    const soldes = await new Promise((resolve, reject) => {
                        ctx.db.get('SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?', [salarie_id, anneeAbsence], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });

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
                    await new Promise((resolve, reject) => {
                        ctx.db.run(
                            `INSERT INTO notifications (type, titre, message, statut) VALUES ('absence', ?, ?, 'success')`,
                            [titre, message],
                            (err) => {
                                if (err) { console.error('Erreur notification absence:', err); reject(err); }
                                else { console.log('Notification absence créée'); resolve(); }
                            }
                        );
                    });
                }
            } catch (errNotif) {
                console.error('Erreur création notification absence:', errNotif);
            }
        }

        return result;
    });

    safeHandle('deleteAbsence', async (event, absenceId) => {
        return new Promise((resolve, reject) => {
            ctx.db.get('SELECT * FROM absences WHERE id = ?', [absenceId], async (err, absence) => {
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
                const anneeEnCours = new Date().getFullYear();

                try {
                    await new Promise((res, rej) => {
                        ctx.db.run('DELETE FROM absences WHERE id = ?', [absenceId], (err) => {
                            if (err) rej(err);
                            else res();
                        });
                    });

                    if (type !== 'MALADIE') {
                        await new Promise((res, rej) => {
                            ctx.db.get(
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

                                    let nouveauCPN1 = soldes.cp_n1;
                                    let nouveauCPN = soldes.cp_n;
                                    let nouveauRTT = soldes.rtt;
                                    let nouvelleRecup = soldes.recup_heures;

                                    if (type === 'CP_N1') {
                                        nouveauCPN1 = soldes.cp_n1 + dureeJours;
                                    } else if (type === 'CP_N' || type === 'CP') {
                                        nouveauCPN = soldes.cp_n + dureeJours;
                                    } else if (type === 'RTT') {
                                        nouveauRTT = soldes.rtt + dureeJours;
                                    } else if (type === 'RECUP') {
                                        nouvelleRecup = soldes.recup_heures + dureeHeures;
                                    }

                                    ctx.db.run(
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

    safeHandle('updateAbsence', async (event, absenceId, updates) => {
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

            ctx.db.run(sql, values, (err) => {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

};
