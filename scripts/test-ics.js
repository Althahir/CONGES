/**
 * Test manuel du générateur ICS — génère plusieurs cas dans `out/test-ics/`
 * pour validation visuelle dans Outlook.
 *
 * Usage : node scripts/test-ics.js
 * Puis double-cliquer sur chaque .ics depuis l'Explorateur.
 */

const fs = require('fs');
const path = require('path');
const { generateIcs } = require('../src/handlers/ics');

const OUTPUT_DIR = path.join(__dirname, '..', 'out', 'test-ics');

const salarie = { prenom: 'Lilian', nom: 'LAUNAY' };

const cas = [
    {
        nom: '01-CP-1jour-complet',
        absence: { id: 1001, type: 'CP', date_debut: '2026-05-20', date_fin: '2026-05-20',
                   debut_periode: 'journee-complete', fin_periode: 'journee-complete',
                   commentaire: 'Test journée complète' }
    },
    {
        nom: '02-CP-multi-jours-complet',
        absence: { id: 1002, type: 'CP', date_debut: '2026-05-18', date_fin: '2026-05-22',
                   debut_periode: 'journee-complete', fin_periode: 'journee-complete',
                   commentaire: 'Semaine complète' }
    },
    {
        nom: '03-CP-matin-seul',
        absence: { id: 1003, type: 'CP', date_debut: '2026-05-20', date_fin: '2026-05-20',
                   debut_periode: 'matin', fin_periode: 'midi',
                   commentaire: 'Demi-journée matin (8h-12h attendu)' }
    },
    {
        nom: '04-CP-aprem-seul',
        absence: { id: 1004, type: 'CP', date_debut: '2026-05-20', date_fin: '2026-05-20',
                   debut_periode: 'apres-midi', fin_periode: 'fin-journee',
                   commentaire: 'Demi-journée après-midi (14h-18h attendu)' }
    },
    {
        nom: '05-CP-debute-aprem-multi',
        absence: { id: 1005, type: 'CP', date_debut: '2026-05-20', date_fin: '2026-05-22',
                   debut_periode: 'apres-midi', fin_periode: 'fin-journee',
                   commentaire: 'Mer aprem -> Ven complet : aprem du 20 + all-day 21+22' }
    },
    {
        nom: '06-CP-finit-midi-multi',
        absence: { id: 1006, type: 'CP', date_debut: '2026-05-18', date_fin: '2026-05-20',
                   debut_periode: 'matin', fin_periode: 'midi',
                   commentaire: 'Lun complet -> Mer matin : all-day 18+19 + matin du 20' }
    },
    {
        nom: '07-CP-demi-aux-deux-extremites',
        absence: { id: 1007, type: 'CP', date_debut: '2026-05-18', date_fin: '2026-05-22',
                   debut_periode: 'apres-midi', fin_periode: 'midi',
                   commentaire: 'Lun aprem -> Ven matin : 3 events (aprem 18, all-day 19+20+21, matin 22)' }
    },
    {
        nom: '08-RTT-1jour',
        absence: { id: 1008, type: 'RTT', date_debut: '2026-05-21', date_fin: '2026-05-21',
                   debut_periode: 'journee-complete', fin_periode: 'journee-complete',
                   commentaire: '' }
    },
    {
        nom: '09-RECUP-1jour',
        absence: { id: 1009, type: 'RECUP', date_debut: '2026-05-22', date_fin: '2026-05-22',
                   debut_periode: 'journee-complete', fin_periode: 'journee-complete',
                   commentaire: 'Récupération heures sup' }
    },
    {
        nom: '10-CANCEL-1jour',
        absence: { id: 1001, type: 'CP', date_debut: '2026-05-20', date_fin: '2026-05-20',
                   debut_periode: 'journee-complete', fin_periode: 'journee-complete',
                   commentaire: 'Annulation du cas 01' },
        options: { method: 'CANCEL', sequence: 1 }
    }
];

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`Génération de ${cas.length} fichiers .ics dans ${OUTPUT_DIR}\n`);

for (const c of cas) {
    const content = generateIcs(c.absence, salarie, c.options || {});
    const filePath = path.join(OUTPUT_DIR, `${c.nom}.ics`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  [OK] ${c.nom}.ics`);
}

console.log(`\nOuvrir le dossier : ${OUTPUT_DIR}`);
console.log('Double-cliquer sur chaque .ics depuis l\'Explorateur pour tester dans Outlook.');
