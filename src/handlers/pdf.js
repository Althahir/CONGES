const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shell, dialog } = require('electron');

module.exports = function registerPDFHandlers(ctx, safeHandle) {

    safeHandle('genererPDF', async (event, absenceData) => {
        return new Promise((resolve, reject) => {
            try {
                const { salarie, absence, soldes } = absenceData;

                const fileName = `demande_conges_${salarie.nom}_${salarie.prenom}_${Date.now()}.pdf`;
                const filePath = path.join(os.tmpdir(), fileName);

                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50
                });
                const stream = fs.createWriteStream(filePath);

                doc.pipe(stream);

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

                doc.fillColor('black');
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

                const dateD = new Date(absence.date_debut).toLocaleDateString('fr-FR', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
                const dateF = new Date(absence.date_fin).toLocaleDateString('fr-FR', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });

                doc.font('Helvetica-Bold')
                   .text('Du : ', 60, yPeriode + 65, { continued: true })
                   .font('Helvetica')
                   .text(dateD);

                doc.font('Helvetica-Bold')
                   .text('Au : ', 60, yPeriode + 85, { continued: true })
                   .font('Helvetica')
                   .text(dateF);

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

                const tableTop = doc.y;
                const col1 = 60;
                const col2 = 250;
                const rowHeight = 25;

                doc.rect(col1, tableTop, doc.page.width - 120, rowHeight)
                   .fill(bleu);

                doc.fillColor('white')
                   .fontSize(10)
                   .font('Helvetica-Bold')
                   .text('Type de congé', col1 + 10, tableTop + 8)
                   .text('Solde restant', col2, tableTop + 8);

                doc.fillColor('black');

                const soldesData = [
                    ['CP N-1', `${soldes.cp_n1.toFixed(2)} jours`],
                    ['CP N', `${soldes.cp_n.toFixed(2)} jours`],
                    ['RTT', `${soldes.rtt.toFixed(2)} jours`],
                    ['Récupération', `${soldes.recup_heures.toFixed(1)} heures`]
                ];

                soldesData.forEach((row, i) => {
                    const y = tableTop + rowHeight + (i * rowHeight);

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

                doc.end();

                stream.on('finish', () => {
                    shell.openPath(filePath).then(() => {
                        console.log('PDF ouvert:', filePath);
                    });

                    setTimeout(() => {
                        dialog.showSaveDialog(ctx.mainWindow, {
                            title: 'Enregistrer ou imprimer le PDF',
                            defaultPath: path.join(os.homedir(), 'Documents', fileName),
                            filters: [{ name: 'PDF', extensions: ['pdf'] }]
                        }).then(result => {
                            if (!result.canceled && result.filePath) {
                                fs.copyFileSync(filePath, result.filePath);
                                console.log('PDF sauvegardé à:', result.filePath);
                                shell.openPath(result.filePath);
                            }
                        });
                    }, 500);

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

    safeHandle('exporterRecapPDF', async (event, data) => {
        const { salarie_id, annee } = data;
        return new Promise(async (resolve, reject) => {
            try {
                const salarie = await new Promise((res, rej) => {
                    ctx.db.get('SELECT * FROM salaries WHERE id = ?', [salarie_id], (err, row) => err ? rej(err) : res(row));
                });
                const soldes = await new Promise((res, rej) => {
                    ctx.db.get('SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?', [salarie_id, annee], (err, row) => err ? rej(err) : res(row));
                });
                const absences = await new Promise((res, rej) => {
                    ctx.db.all(
                        `SELECT * FROM absences WHERE salarie_id = ? AND statut = "valide"
                         AND (substr(date_debut,1,4) = ? OR substr(date_fin,1,4) = ?)
                         ORDER BY date_debut`,
                        [salarie_id, String(annee), String(annee)],
                        (err, rows) => err ? rej(err) : res(rows || [])
                    );
                });

                const fileName = `recap_${salarie.nom}_${salarie.prenom}_${annee}.pdf`;
                const filePath = path.join(os.tmpdir(), fileName);
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

                const bleu = '#006C89';
                const orange = '#ED7111';
                const gris = '#666666';

                // === EN-TÊTE ===
                doc.rect(0, 0, doc.page.width, 90).fill(bleu);
                doc.fillColor('white')
                   .fontSize(22).font('Helvetica-Bold')
                   .text('RÉCAPITULATIF DES CONGÉS', 50, 25, { align: 'center' })
                   .fontSize(11).font('Helvetica')
                   .text(`${salarie.prenom} ${salarie.nom.toUpperCase()} — Année ${annee}`, 50, 55, { align: 'center' });

                doc.fillColor('black');
                doc.moveDown(4);

                // === SOLDES ===
                const ySoldes = doc.y;
                doc.fontSize(14).font('Helvetica-Bold').fillColor(bleu)
                   .text('SOLDES', 50, ySoldes);
                doc.moveDown(0.5);

                const tableTop = doc.y;
                const colW = (doc.page.width - 100) / 4;
                const soldesItems = [
                    { label: 'CP N-1', value: soldes ? `${soldes.cp_n1.toFixed(2)} j` : '—' },
                    { label: 'CP N', value: soldes ? `${soldes.cp_n.toFixed(2)} j` : '—' },
                    { label: 'RTT', value: soldes ? `${soldes.rtt.toFixed(2)} j` : '—' },
                    { label: 'Récup', value: soldes ? `${soldes.recup_heures.toFixed(1)} h` : '—' }
                ];

                soldesItems.forEach((item, i) => {
                    const x = 50 + i * colW;
                    doc.rect(x, tableTop, colW, 40).lineWidth(1).stroke(bleu);
                    doc.fontSize(9).font('Helvetica').fillColor(gris)
                       .text(item.label, x, tableTop + 5, { width: colW, align: 'center' });
                    doc.fontSize(14).font('Helvetica-Bold').fillColor('black')
                       .text(item.value, x, tableTop + 20, { width: colW, align: 'center' });
                });

                doc.y = tableTop + 55;

                // === TABLEAU DES ABSENCES ===
                doc.fontSize(14).font('Helvetica-Bold').fillColor(bleu)
                   .text('ABSENCES', 50, doc.y);
                doc.moveDown(0.5);

                if (absences.length === 0) {
                    doc.fontSize(11).font('Helvetica').fillColor(gris)
                       .text('Aucune absence enregistrée pour cette année.', 50);
                } else {
                    const typeLabels = {
                        'CP': 'CP', 'CP_N': 'CP N', 'CP_N1': 'CP N-1',
                        'RTT': 'RTT', 'RECUP': 'Récup', 'MALADIE': 'Maladie'
                    };

                    const absTop = doc.y;
                    const cols = [50, 130, 260, 370, 440];
                    const hdrs = ['Type', 'Du', 'Au', 'Durée', 'Commentaire'];
                    const colWidths = [80, 130, 110, 70, doc.page.width - 50 - 440];
                    const rowH = 22;

                    doc.rect(50, absTop, doc.page.width - 100, rowH).fill(bleu);
                    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
                    hdrs.forEach((h, i) => doc.text(h, cols[i] + 5, absTop + 7, { width: colWidths[i] }));

                    let yRow = absTop + rowH;
                    doc.fillColor('black');

                    absences.forEach((abs, idx) => {
                        if (yRow + rowH > doc.page.height - 80) {
                            doc.addPage();
                            yRow = 50;
                        }

                        if (idx % 2 === 0) {
                            doc.rect(50, yRow, doc.page.width - 100, rowH).fill('#f5f5f5');
                        }

                        const dateD = new Date(abs.date_debut).toLocaleDateString('fr-FR');
                        const dateF = new Date(abs.date_fin).toLocaleDateString('fr-FR');
                        const duree = abs.duree_heures && !abs.duree_jours
                            ? `${abs.duree_heures.toFixed(1)}h`
                            : `${(abs.duree_jours || 0).toFixed(2)}j`;
                        const comment = (abs.commentaire || '').substring(0, 30);

                        doc.fillColor('black').fontSize(9).font('Helvetica');
                        doc.text(typeLabels[abs.type] || abs.type, cols[0] + 5, yRow + 7, { width: colWidths[0] });
                        doc.text(dateD, cols[1] + 5, yRow + 7, { width: colWidths[1] });
                        doc.text(dateF, cols[2] + 5, yRow + 7, { width: colWidths[2] });
                        doc.text(duree, cols[3] + 5, yRow + 7, { width: colWidths[3] });
                        doc.text(comment, cols[4] + 5, yRow + 7, { width: colWidths[4] });

                        yRow += rowH;
                    });

                    doc.y = yRow + 10;
                    doc.fontSize(10).font('Helvetica-Bold').fillColor('black')
                       .text(`Total : ${absences.length} absence(s)`, 50);
                }

                // === PIED DE PAGE ===
                const pageBottom = doc.page.height - 40;
                if (doc.y > pageBottom - 20) doc.addPage();
                doc.fontSize(8).fillColor('#999')
                   .text(`Document généré le ${new Date().toLocaleString('fr-FR')} — La Ciotat Entreprendre`,
                       50, pageBottom, { align: 'center', width: doc.page.width - 100, lineBreak: false });

                doc.end();

                stream.on('finish', () => {
                    shell.openPath(filePath);
                    setTimeout(() => {
                        dialog.showSaveDialog(ctx.mainWindow, {
                            title: 'Enregistrer le récapitulatif PDF',
                            defaultPath: path.join(os.homedir(), 'Documents', fileName),
                            filters: [{ name: 'PDF', extensions: ['pdf'] }]
                        }).then(result => {
                            if (!result.canceled && result.filePath) {
                                fs.copyFileSync(filePath, result.filePath);
                                shell.openPath(result.filePath);
                            }
                        });
                    }, 500);
                    resolve({ success: true, filePath });
                });

                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    });

};
