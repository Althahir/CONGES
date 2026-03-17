module.exports = function registerSoldesHandlers(ctx, safeHandle) {

    safeHandle('getSoldes', async (event, salarieId, annee) => {
        return new Promise((resolve, reject) => {
            ctx.db.get(
                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                [salarieId, annee],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || { salarie_id: salarieId, annee, cp_n1: 0, cp_n: 0, rtt: 0, recup_heures: 0 });
                }
            );
        });
    });

    safeHandle('updateSoldes', async (event, salarieId, annee, soldes) => {
        return new Promise((resolve, reject) => {
            ctx.db.get(
                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                [salarieId, annee],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (row) {
                        ctx.db.run(
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
                        ctx.db.run(
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

    safeHandle('updateSoldesAfterAbsence', async (event, salarieId, annee, type, dureeJours, dureeHeures) => {
        return new Promise((resolve, reject) => {
            ctx.db.get(
                'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
                [salarieId, annee],
                (err, soldes) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!soldes) {
                        reject(new Error('Soldes introuvables'));
                        return;
                    }

                    let nouveauCPN1 = soldes.cp_n1;
                    let nouveauCPN = soldes.cp_n;
                    let nouveauRTT = soldes.rtt;
                    let nouveauRecup = soldes.recup_heures;

                    if (type === 'CP' || type === 'CP_N' || type === 'CP_N1') {
                        let resteADeduire = dureeJours;
                        if (nouveauCPN1 > 0) {
                            const deductionN1 = Math.min(nouveauCPN1, resteADeduire);
                            nouveauCPN1 -= deductionN1;
                            resteADeduire -= deductionN1;
                        }
                        if (resteADeduire > 0) {
                            nouveauCPN -= resteADeduire;
                        }
                    } else if (type === 'RTT') {
                        nouveauRTT -= dureeJours;
                    } else if (type === 'RECUP') {
                        if (dureeHeures && dureeHeures > 0) {
                            nouveauRecup -= dureeHeures;
                        } else if (dureeJours && dureeJours > 0) {
                            nouveauRecup -= dureeJours * 7;
                        }
                    }

                    ctx.db.run(
                        `UPDATE soldes
                         SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP
                         WHERE salarie_id = ? AND annee = ?`,
                        [nouveauCPN1, nouveauCPN, nouveauRTT, nouveauRecup, salarieId, annee],
                        (err) => {
                            if (err) reject(err);
                            else resolve({
                                success: true,
                                cp_n1: nouveauCPN1,
                                cp_n: nouveauCPN,
                                rtt: nouveauRTT,
                                recup_heures: nouveauRecup
                            });
                        }
                    );
                }
            );
        });
    });

};
