const PDFDocument = require('pdfkit');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shell, dialog, BrowserWindow } = require('electron');

module.exports = function registerPDFHandlers(ctx, safeHandle) {

    // === Constantes destination OneDrive partagée LCE ===
    const ONEDRIVE_SUBPATH = path.join(
        'LA CIOTAT ENTREPRENDRE - DONNEES',
        '17 DOSSIERS SALARIES',
        'CONGES',
        'PDF'
    );

    function resolveOneDrivePath() {
        const root = process.env.OneDriveCommercial || process.env.OneDrive;
        if (!root) return null;
        const target = path.join(root, ONEDRIVE_SUBPATH);
        try {
            if (!fs.existsSync(target)) return null;
            fs.accessSync(target, fs.constants.W_OK);
            return target;
        } catch (e) {
            return null;
        }
    }

    const TYPE_LABELS_FILE = { CP: 'CP', CP_N: 'CP', CP_N1: 'CP', RTT: 'RTT', RECUP: 'RECUP', MALADIE: 'MALADIE' };

    function sanitizeForFilename(s) {
        return String(s || '').replace(/[\\/:*?"<>|\s]/g, '_').replace(/_+/g, '_');
    }

    function buildFileName(salarie, absence, annulation = false) {
        const type = TYPE_LABELS_FILE[absence.type] || absence.type;
        const nom = sanitizeForFilename(salarie.nom.toUpperCase());
        const prenom = sanitizeForFilename(salarie.prenom);
        // Date au format AAAAMMJJ (sans tirets) — basée sur date_debut de l'absence pour tri chronologique
        const dateAaaammjj = String(absence.date_debut || '').replace(/-/g, '');
        const suffix = annulation ? '-ANNULATION' : '';
        return `${dateAaaammjj}-${type}-${nom}-${prenom}${suffix}.pdf`;
    }

    const MOIS_COURTS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    function formatDateLong(d = new Date()) {
        return `${String(d.getDate()).padStart(2, '0')} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`;
    }

    const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    function formatDateHeader(d = new Date()) {
        return `${String(d.getDate()).padStart(2, '0')} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
    }

    // Tente l'impression directe sur l'imprimante par défaut Windows
    async function tryPrintAuto(filePath) {
        try {
            const printers = await ctx.mainWindow.webContents.getPrintersAsync();
            const defaultPrinter = printers.find(p => p.isDefault);
            if (!defaultPrinter) return { printed: false, reason: 'no_default_printer' };

            const printWin = new BrowserWindow({
                show: false,
                webPreferences: { plugins: true, sandbox: false }
            });

            try {
                await printWin.loadURL('file:///' + filePath.replace(/\\/g, '/'));
            } catch (e) {
                if (!printWin.isDestroyed()) printWin.close();
                return { printed: false, reason: 'load_failed: ' + e.message };
            }

            // Laisser le rendu PDF se terminer
            await new Promise(r => setTimeout(r, 1200));

            return new Promise((resolve) => {
                printWin.webContents.print({
                    silent: true,
                    deviceName: defaultPrinter.name,
                    printBackground: true
                }, (success, errorType) => {
                    setTimeout(() => { if (!printWin.isDestroyed()) printWin.close(); }, 500);
                    if (success) resolve({ printed: true, printer: defaultPrinter.name });
                    else resolve({ printed: false, reason: errorType || 'print_failed' });
                });
            });
        } catch (e) {
            return { printed: false, reason: e.message };
        }
    }

    // Selon le mode, enregistre/imprime le PDF temporaire et retourne l'issue
    async function dispatchPDF(tmpFilePath, fileName, mode) {
        // Mode 'auto' : OneDrive auto, fallback showSaveDialog
        if (mode === 'auto') {
            const oneDrivePath = resolveOneDrivePath();
            if (oneDrivePath) {
                const target = path.join(oneDrivePath, fileName);
                fs.copyFileSync(tmpFilePath, target);
                return { savedPath: target, autoSaved: true };
            }
            const result = await dialog.showSaveDialog(ctx.mainWindow, {
                title: 'OneDrive indisponible — Enregistrer le PDF',
                defaultPath: path.join(os.homedir(), 'Documents', fileName),
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (!result.canceled && result.filePath) {
                fs.copyFileSync(tmpFilePath, result.filePath);
                return { savedPath: result.filePath, autoSaved: false };
            }
            return { savedPath: null, autoSaved: false, canceled: true };
        }

        // Mode 'print' : impression auto, fallback showSaveDialog si pas d'imprimante
        if (mode === 'print') {
            const printResult = await tryPrintAuto(tmpFilePath);
            if (printResult.printed) {
                return { savedPath: tmpFilePath, printed: true, printer: printResult.printer };
            }
            const result = await dialog.showSaveDialog(ctx.mainWindow, {
                title: 'Aucune imprimante par défaut — Enregistrer le PDF',
                defaultPath: path.join(os.homedir(), 'Documents', fileName),
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (!result.canceled && result.filePath) {
                fs.copyFileSync(tmpFilePath, result.filePath);
                return { savedPath: result.filePath, printed: false, autoSaved: false };
            }
            return { savedPath: null, printed: false, canceled: true };
        }

        // Mode 'dialog' : showSaveDialog seul (sans ouverture auto)
        const result = await dialog.showSaveDialog(ctx.mainWindow, {
            title: 'Enregistrer le PDF',
            defaultPath: path.join(os.homedir(), 'Documents', fileName),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (!result.canceled && result.filePath) {
            fs.copyFileSync(tmpFilePath, result.filePath);
            return { savedPath: result.filePath, autoSaved: false };
        }
        return { savedPath: null, canceled: true };
    }

    safeHandle('genererPDF', async (event, absenceData) => {
        const { salarie, absence, soldes, valideur, annulation, mode } = absenceData;
        const finalMode = mode || (salarie.role === 'admin' ? 'print' : 'dialog');

        const fileName = buildFileName(salarie, absence, annulation);
        const tmpFilePath = path.join(os.tmpdir(), `tmp_${Date.now()}_${fileName}`);

        // === Génération du PDF ===
        await new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const stream = fs.createWriteStream(tmpFilePath);
                doc.pipe(stream);

                const bleu = '#006C89';
                const rouge = '#B5163F';
                const couleurTitre = annulation ? rouge : bleu;
                const pageW = doc.page.width;
                const margin = 50;
                const contentW = pageW - margin * 2;
                const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');

                // === EN-TÊTE ===
                try {
                    doc.image(logoPath, margin, 15, { fit: [120, 60] });
                } catch (e) { /* logo absent */ }

                const titre = annulation ? 'ANNULATION DE CONGÉS' : 'DEMANDE DE CONGÉS';
                doc.fillColor(couleurTitre)
                   .fontSize(20).font('Helvetica-Bold')
                   .text(titre, 200, 20, { width: pageW - 250, align: 'right' })
                   .fontSize(9).font('Helvetica').fillColor('#888')
                   .text(`La Ciotat Entreprendre  ·  Le ${formatDateHeader()}`, 200, 45, { width: pageW - 250, align: 'right' });

                doc.moveTo(margin, 80).lineTo(pageW - margin, 80).lineWidth(2).strokeColor(couleurTitre).stroke();

                let yPos = 95;

                function drawSectionHeader(y, h, title) {
                    doc.save();
                    doc.roundedRect(margin, y, contentW, h, 5).clip();
                    doc.rect(margin, y, contentW, 22).fill(couleurTitre);
                    doc.restore();
                    doc.roundedRect(margin, y, contentW, h, 5).lineWidth(1).stroke(couleurTitre);
                    doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
                       .text(title, margin + 12, y + 6, { lineBreak: false });
                }

                // === INFOS SALARIÉ ===
                drawSectionHeader(yPos, 70, 'INFORMATIONS DU SALARIÉ');
                doc.fillColor('black').fontSize(11).font('Helvetica')
                   .text(`Nom : ${salarie.nom.toUpperCase()}`, margin + 12, yPos + 30, { lineBreak: false })
                   .text(`Prénom : ${salarie.prenom}`, margin + 12, yPos + 48, { lineBreak: false });
                yPos += 80;

                // === PÉRIODE ===
                drawSectionHeader(yPos, 140, 'PÉRIODE DE CONGÉS');
                const yPeriode = yPos;

                const typeLabels = {
                    'CP': 'Congés Payés', 'CP_N': 'Congés Payés', 'CP_N1': 'Congés Payés',
                    'RTT': 'RTT', 'RECUP': 'Récupération', 'MALADIE': 'Arrêt Maladie'
                };

                doc.fontSize(11).fillColor('black').font('Helvetica-Bold')
                   .text('Type de congé : ', margin + 12, yPeriode + 30, { continued: true })
                   .font('Helvetica').text(typeLabels[absence.type] || absence.type);

                const dateD = new Date(absence.date_debut).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const dateF = new Date(absence.date_fin).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                doc.font('Helvetica-Bold').text('Du : ', margin + 12, yPeriode + 55, { continued: true })
                   .font('Helvetica').text(dateD);
                doc.font('Helvetica-Bold').text('Au : ', margin + 12, yPeriode + 75, { continued: true })
                   .font('Helvetica').text(dateF);
                doc.font('Helvetica-Bold').text('Durée : ', margin + 12, yPeriode + 100, { continued: true })
                   .font('Helvetica');
                if (absence.duree_jours) doc.text(`${absence.duree_jours.toFixed(2)} jour(s)`);
                else if (absence.duree_heures) doc.text(`${absence.duree_heures.toFixed(2)} heure(s)`);

                yPos += 150;

                // === SOLDES ===
                const rowHeight = 25;
                const soldesH = 22 + rowHeight * 4;
                drawSectionHeader(yPos, soldesH, annulation ? 'SOLDES APRÈS ANNULATION' : 'SOLDES APRÈS DÉDUCTION');
                const col1 = margin + 12;
                const col2 = margin + contentW / 2;
                const tableTop = yPos + 22;
                const soldesData = [
                    ['CP N-1', `${soldes.cp_n1.toFixed(2)} jours`],
                    ['CP N', `${soldes.cp_n.toFixed(2)} jours`],
                    ['RTT', `${soldes.rtt.toFixed(2)} jours`],
                    ['Récupération', `${soldes.recup_heures.toFixed(2)} heures`]
                ];
                soldesData.forEach((row, i) => {
                    const y = tableTop + (i * rowHeight);
                    if (i % 2 === 0) {
                        doc.rect(margin + 1, y, contentW - 2, rowHeight).fill('#f0f7f9');
                    }
                    doc.fillColor('#333').fontSize(10).font('Helvetica')
                       .text(row[0], col1, y + 8, { lineBreak: false });
                    doc.fillColor(couleurTitre).font('Helvetica-Bold')
                       .text(row[1], col2, y + 8, { lineBreak: false });
                });

                yPos += soldesH + 15;

                // === SIGNATURE / VALIDATION ===
                // Si valideur présent (validation par admin ou annulation par admin) :
                //   → mention "Validé/Annulé par : ..." en bas de page, pas de bloc signature
                // Sinon (pose admin pour soi-même) :
                //   → bloc signature classique (Salarié + Président)
                const ySign = doc.page.height - 160;
                doc.moveTo(margin, ySign).lineTo(pageW - margin, ySign).lineWidth(0.5).strokeColor(couleurTitre).stroke();

                if (valideur && valideur.nom && valideur.prenom) {
                    const dateMention = formatDateLong(new Date());
                    const verbe = annulation ? 'Annulé par' : 'Validé par';
                    const mention = `${verbe} : ${valideur.prenom} ${valideur.nom.toUpperCase()}, Secrétaire Général le ${dateMention}`;
                    doc.fillColor(couleurTitre).fontSize(11).font('Helvetica-Bold')
                       .text(mention, margin + 10, ySign + 20, { width: contentW - 20, align: 'left' });
                } else {
                    const isAdmin = salarie.role === 'admin';
                    doc.fillColor(couleurTitre).fontSize(11).font('Helvetica-Bold')
                       .text('Signatures :', margin + 10, ySign + 10, { lineBreak: false });

                    const colW = contentW / 2;
                    const labelDroite = isAdmin ? 'Président(e)' : 'Responsable';

                    doc.fillColor('#333').fontSize(10).font('Helvetica')
                       .text('Salarié(e)', margin + 10, ySign + 30, { lineBreak: false });
                    doc.fillColor('#333').fontSize(10).font('Helvetica')
                       .text(labelDroite, margin + colW + 10, ySign + 30, { lineBreak: false });
                }

                doc.end();
                stream.on('finish', resolve);
                stream.on('error', reject);
            } catch (e) { reject(e); }
        });

        // === Distribution selon le mode ===
        const issue = await dispatchPDF(tmpFilePath, fileName, finalMode);
        return { success: true, mode: finalMode, fileName, ...issue };
    });

    safeHandle('exporterRecapPDF', async (event, data) => {
        const { salarie_id, annee } = data;

        // Fetch data from DB using Turso async syntax
        const salarieResult = await ctx.db.execute({
            sql: 'SELECT * FROM salaries WHERE id = ?',
            args: [salarie_id]
        });
        const salarie = salarieResult.rows[0];

        const soldesResult = await ctx.db.execute({
            sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            args: [salarie_id, annee]
        });
        const soldes = soldesResult.rows[0];

        const absencesResult = await ctx.db.execute({
            sql: `SELECT * FROM absences WHERE salarie_id = ? AND statut = 'valide'
                 AND (substr(date_debut,1,4) = ? OR substr(date_fin,1,4) = ?)
                 ORDER BY date_debut`,
            args: [salarie_id, String(annee), String(annee)]
        });
        const absences = absencesResult.rows || [];

        // PDF generation remains Promise-based (stream events)
        return new Promise((resolve, reject) => {
            try {
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
                    { label: 'Récup', value: soldes ? `${soldes.recup_heures.toFixed(2)} h` : '—' }
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
                            ? `${abs.duree_heures.toFixed(2)}h`
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
                    dialog.showSaveDialog(ctx.mainWindow, {
                        title: 'Enregistrer le récapitulatif PDF',
                        defaultPath: path.join(os.homedir(), 'Documents', fileName),
                        filters: [{ name: 'PDF', extensions: ['pdf'] }]
                    }).then(result => {
                        if (!result.canceled && result.filePath) {
                            fs.copyFileSync(filePath, result.filePath);
                        }
                    });
                    resolve({ success: true, filePath });
                });

                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    });

    // === EXPORT PDF STATISTIQUES ABSENCES ===
    safeHandle('exporterStatsPDF', async (event, data) => {
        const { annee, mois, types, absences } = data;

        return new Promise((resolve, reject) => {
            try {
                const moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                const periodeLabel = mois > 0 ? `${moisNoms[mois]} ${annee}` : `Année ${annee}`;
                const typesLabel = types.join(', ');

                const ts = Date.now();
                const fileName = `stats_absences_${annee}${mois > 0 ? '_' + String(mois).padStart(2, '0') : ''}_${ts}.pdf`;
                const filePath = path.join(os.tmpdir(), fileName);
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

                const bleu = '#006C89';
                const grisClair = '#f8f9fa';
                const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
                const pageW = doc.page.width;
                const pageH = doc.page.height;
                const margin = 50;
                const contentW = pageW - margin * 2;
                const headerH = 80;

                // === EN-TÊTE (fond blanc) ===
                // Logo à gauche, pleine hauteur sans déformation
                try {
                    doc.image(logoPath, margin, 15, { fit: [120, headerH - 20], valign: 'center' });
                } catch (e) { /* logo absent */ }

                // Titre à droite
                doc.fillColor(bleu)
                   .fontSize(18).font('Helvetica-Bold')
                   .text('DÉTAIL DES ABSENCES', 200, 18, { width: pageW - 250, align: 'right' })
                   .fontSize(11).font('Helvetica')
                   .text('PAR SALARIÉ', 200, 40, { width: pageW - 250, align: 'right' });

                // Sous-titre : période et types
                doc.fontSize(9).fillColor('#888')
                   .text(`${periodeLabel}  |  ${typesLabel}`, 200, 58, { width: pageW - 250, align: 'right' });

                // Ligne bleue de séparation sous l'en-tête
                doc.moveTo(margin, headerH + 10).lineTo(pageW - margin, headerH + 10).lineWidth(2).strokeColor(bleu).stroke();

                doc.fillColor('black');
                let yPos = headerH + 20;

                // === RÉSUMÉ ===
                const compteurs = {};
                let totalJours = 0;
                absences.forEach(a => {
                    if (!compteurs[a.type]) compteurs[a.type] = { count: 0, jours: 0 };
                    compteurs[a.type].count++;
                    compteurs[a.type].jours += parseFloat(a.jours) || 0;
                    totalJours += parseFloat(a.jours) || 0;
                });

                const typesCouleurs = { CP: bleu, RTT: bleu, RECUP: bleu, MALADIE: bleu };
                const resumeTypes = Object.keys(compteurs);
                const cardW = (contentW - (resumeTypes.length) * 10) / (resumeTypes.length + 1);

                // Card total
                doc.roundedRect(margin, yPos, cardW, 50, 5).fill(bleu);
                doc.fillColor('white').fontSize(8).font('Helvetica')
                   .text('TOTAL', margin + 8, yPos + 8, { width: cardW - 16 });
                doc.fontSize(16).font('Helvetica-Bold')
                   .text(`${Math.round(totalJours * 100) / 100}j`, margin + 8, yPos + 24, { width: cardW - 16 });

                // Cards par type — couleur de la tuile
                resumeTypes.forEach((t, i) => {
                    const x = margin + (i + 1) * (cardW + 10);
                    const couleur = typesCouleurs[t] || bleu;
                    doc.roundedRect(x, yPos, cardW, 50, 5).lineWidth(1.5).stroke(couleur);
                    doc.fillColor(couleur).fontSize(8).font('Helvetica-Bold')
                       .text(t, x + 8, yPos + 8, { width: cardW - 16 });
                    doc.fillColor(couleur).fontSize(14).font('Helvetica-Bold')
                       .text(`${Math.round(compteurs[t].jours * 100) / 100}j`, x + 8, yPos + 24, { width: cardW - 16 });
                    doc.fillColor('#999').fontSize(7).font('Helvetica')
                       .text(`${compteurs[t].count} absence(s)`, x + 8, yPos + 40, { width: cardW - 16 });
                });

                yPos += 65;

                // Ligne de séparation fine
                doc.moveTo(margin, yPos).lineTo(pageW - margin, yPos).lineWidth(0.5).strokeColor('#ddd').stroke();
                yPos += 10;

                // === TABLEAU ===
                const cols = [margin, margin + 160, margin + 230, margin + 330, margin + 430];
                const hdrs = ['Salarié', 'Type', 'Du', 'Au', 'Jours'];
                const colWidths = [160, 70, 100, 100, contentW - 430 + margin];
                const rowH = 22;
                function drawTableHeader(y) {
                    doc.roundedRect(margin, y, contentW, rowH, 3).fill(bleu);
                    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
                    hdrs.forEach((h, i) => doc.text(h, cols[i] + 8, y + 7, { width: colWidths[i], lineBreak: false }));
                    return y + rowH;
                }

                yPos = drawTableHeader(yPos);

                let currentSalarie = '';
                let salarieIdx = 0;
                absences.forEach((a) => {
                    if (yPos + rowH > pageH - 50) {
                        doc.addPage();
                        yPos = 50;
                        yPos = drawTableHeader(yPos);
                        currentSalarie = '';
                    }

                    const newSalarie = a.salarie !== currentSalarie;
                    if (newSalarie) {
                        if (currentSalarie !== '') {
                            doc.moveTo(margin, yPos).lineTo(pageW - margin, yPos).lineWidth(0.3).strokeColor('#ccc').stroke();
                            yPos += 1;
                        }
                        currentSalarie = a.salarie;
                        salarieIdx++;
                    }

                    const bgColor = salarieIdx % 2 === 0 ? grisClair : 'white';
                    doc.rect(margin, yPos, contentW, rowH).fill(bgColor);

                    if (newSalarie) {
                        doc.rect(margin, yPos, 3, rowH).fill(bleu);
                    }

                    const typeColor = typesCouleurs[a.type] || '#333';

                    doc.fillColor('#333').fontSize(9).font(newSalarie ? 'Helvetica-Bold' : 'Helvetica')
                       .text(newSalarie ? a.salarie : '', cols[0] + 8, yPos + 7, { width: colWidths[0], lineBreak: false });
                    doc.fillColor(typeColor).fontSize(9).font('Helvetica-Bold')
                       .text(a.type, cols[1] + 8, yPos + 7, { width: colWidths[1], lineBreak: false });
                    doc.fillColor('#333').fontSize(9).font('Helvetica')
                       .text(a.du, cols[2] + 8, yPos + 7, { width: colWidths[2], lineBreak: false })
                       .text(a.au, cols[3] + 8, yPos + 7, { width: colWidths[3], lineBreak: false })
                       .text(a.jours, cols[4] + 8, yPos + 7, { width: colWidths[4], lineBreak: false });

                    yPos += rowH;
                });

                // Ligne de fermeture du tableau
                doc.moveTo(margin, yPos).lineTo(pageW - margin, yPos).lineWidth(0.5).strokeColor(bleu).stroke();


                doc.end();

                stream.on('finish', () => {
                    dialog.showSaveDialog(ctx.mainWindow, {
                        title: 'Enregistrer le PDF',
                        defaultPath: path.join(os.homedir(), 'Documents', fileName),
                        filters: [{ name: 'PDF', extensions: ['pdf'] }]
                    }).then(result => {
                        if (!result.canceled && result.filePath) {
                            fs.copyFileSync(filePath, result.filePath);
                        }
                    });
                    resolve({ success: true, filePath });
                });

                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    });

};
