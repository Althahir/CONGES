/**
 * Générateur de fichiers iCalendar (RFC 5545) pour synchronisation Outlook.
 *
 * Stratégie demi-journées : horaires précis 8h-12h (matin) / 14h-18h (après-midi),
 * en floating time (pas de TZID) — l'event s'affiche à l'heure locale du client,
 * cohérent pour une app franco-française.
 *
 * Multi-jours avec demi-journée aux extrémités : génère plusieurs VEVENT dans
 * le même VCALENDAR (premier jour partiel + milieu all-day + dernier jour partiel).
 */

const LABELS_TYPE = {
    CP: 'Congés payés',
    CP_N: 'Congés payés',
    CP_N1: 'Congés payés',
    RTT: 'RTT',
    RECUP: 'Récupération',
    MALADIE: 'Arrêt maladie'
};

const HEURE_MATIN_DEBUT = '080000';
const HEURE_MATIN_FIN = '120000';
const HEURE_APREM_DEBUT = '140000';
const HEURE_APREM_FIN = '180000';

function escapeIcsText(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/**
 * Plie une ligne ICS à 75 octets (RFC 5545 §3.1) — CRLF + espace en début de continuation.
 */
function foldLine(line) {
    if (Buffer.byteLength(line, 'utf8') <= 75) return line;
    const chunks = [];
    let current = '';
    let currentBytes = 0;
    for (const char of line) {
        const charBytes = Buffer.byteLength(char, 'utf8');
        const limit = chunks.length === 0 ? 75 : 74; // continuation = espace + 74
        if (currentBytes + charBytes > limit) {
            chunks.push(current);
            current = char;
            currentBytes = charBytes;
        } else {
            current += char;
            currentBytes += charBytes;
        }
    }
    if (current) chunks.push(current);
    return chunks.join('\r\n ');
}

function dateIsoToCompact(dateIso) {
    return dateIso.replace(/-/g, '');
}

function addDaysIso(dateIso, n) {
    const [y, m, d] = dateIso.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d + n);
    const dt = new Date(t);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function nowUtcCompact() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Construit un VEVENT all-day.
 * DTEND est exclusif selon RFC 5545 → on ajoute 1 jour à la date de fin.
 */
function buildAllDayEvent({ uid, summary, description, dateDebutIso, dateFinIso, sequence, status }) {
    const dtstart = dateIsoToCompact(dateDebutIso);
    const dtend = dateIsoToCompact(addDaysIso(dateFinIso, 1));
    return [
        'BEGIN:VEVENT',
        foldLine(`UID:${uid}`),
        `DTSTAMP:${nowUtcCompact()}`,
        foldLine(`SUMMARY:${escapeIcsText(summary)}`),
        description ? foldLine(`DESCRIPTION:${escapeIcsText(description)}`) : null,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        'TRANSP:OPAQUE',
        `STATUS:${status}`,
        `SEQUENCE:${sequence}`,
        'END:VEVENT'
    ].filter(Boolean).join('\r\n');
}

/**
 * Construit un VEVENT horaire (demi-journée).
 * Floating time : pas de TZID, pas de Z → l'event s'affiche à l'heure locale du client.
 */
function buildTimedEvent({ uid, summary, description, dateIso, heureDebut, heureFin, sequence, status }) {
    const dateCompact = dateIsoToCompact(dateIso);
    return [
        'BEGIN:VEVENT',
        foldLine(`UID:${uid}`),
        `DTSTAMP:${nowUtcCompact()}`,
        foldLine(`SUMMARY:${escapeIcsText(summary)}`),
        description ? foldLine(`DESCRIPTION:${escapeIcsText(description)}`) : null,
        `DTSTART:${dateCompact}T${heureDebut}`,
        `DTEND:${dateCompact}T${heureFin}`,
        'TRANSP:OPAQUE',
        `STATUS:${status}`,
        `SEQUENCE:${sequence}`,
        'END:VEVENT'
    ].filter(Boolean).join('\r\n');
}

/**
 * Génère le contenu d'un fichier .ics pour une absence donnée.
 *
 * @param {Object} absence - { id, type, date_debut, date_fin, debut_periode, fin_periode, commentaire }
 * @param {Object} salarie - { nom, prenom }
 * @param {Object} [options]
 * @param {'PUBLISH'|'CANCEL'} [options.method='PUBLISH'] - PUBLISH crée l'event, CANCEL le supprime
 * @param {boolean} [options.includeName=false] - inclut « — Prénom NOM » dans le SUMMARY (utile pour calendrier admin équipe)
 * @param {number} [options.sequence=0] - SEQUENCE (incrémenté à chaque modif d'un même UID)
 * @returns {string} contenu du fichier .ics
 */
function generateIcs(absence, salarie, options = {}) {
    const method = options.method || 'PUBLISH';
    const includeName = options.includeName === true;
    const sequence = options.sequence || 0;
    const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';

    const uid = `absence-${absence.id}@conges-lce`;
    const typeLabel = LABELS_TYPE[absence.type] || absence.type;
    const nom = includeName ? ` — ${salarie.prenom} ${salarie.nom}` : '';
    const commentaire = (absence.commentaire || '').trim();
    // SUMMARY = commentaire si présent (« Voyage Espagne », « RDV médecin »...),
    // sinon fallback sur le type d'absence (« Congés payés »).
    // Le type passe alors en DESCRIPTION pour ne pas perdre l'info.
    const summary = commentaire ? `${commentaire}${nom}` : `${typeLabel}${nom}`;
    const description = commentaire ? typeLabel : '';

    const debutPeriode = absence.debut_periode || 'journee-complete';
    const finPeriode = absence.fin_periode || 'journee-complete';
    const debutDemi = debutPeriode === 'apres-midi' || debutPeriode === 'midi';
    const finDemi = finPeriode === 'midi' || finPeriode === 'matin';

    const events = [];
    const mkArgs = extras => ({ uid, summary, description, sequence, status, ...extras });

    if (absence.date_debut === absence.date_fin) {
        // Un seul jour
        if (debutDemi && !finDemi) {
            // après-midi uniquement
            events.push(buildTimedEvent(mkArgs({
                dateIso: absence.date_debut, heureDebut: HEURE_APREM_DEBUT, heureFin: HEURE_APREM_FIN
            })));
        } else if (!debutDemi && finDemi) {
            // matin uniquement
            events.push(buildTimedEvent(mkArgs({
                dateIso: absence.date_debut, heureDebut: HEURE_MATIN_DEBUT, heureFin: HEURE_MATIN_FIN
            })));
        } else {
            // journée complète
            events.push(buildAllDayEvent(mkArgs({
                dateDebutIso: absence.date_debut, dateFinIso: absence.date_fin
            })));
        }
    } else {
        // Multi-jours : éventuellement 3 morceaux (début partiel + milieu all-day + fin partiel)
        if (debutDemi) {
            events.push(buildTimedEvent(mkArgs({
                dateIso: absence.date_debut, heureDebut: HEURE_APREM_DEBUT, heureFin: HEURE_APREM_FIN
            })));
        }

        const middleDebut = debutDemi ? addDaysIso(absence.date_debut, 1) : absence.date_debut;
        const middleFin = finDemi ? addDaysIso(absence.date_fin, -1) : absence.date_fin;
        if (middleDebut <= middleFin) {
            events.push(buildAllDayEvent(mkArgs({
                dateDebutIso: middleDebut, dateFinIso: middleFin
            })));
        }

        if (finDemi) {
            events.push(buildTimedEvent(mkArgs({
                dateIso: absence.date_fin, heureDebut: HEURE_MATIN_DEBUT, heureFin: HEURE_MATIN_FIN
            })));
        }
    }

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ATHELIA Conges LCE//FR',
        'CALSCALE:GREGORIAN',
        `METHOD:${method}`,
        ...events,
        'END:VCALENDAR'
    ];

    return lines.join('\r\n') + '\r\n';
}

// ============ Handler IPC ============
// Inscrit `genererIcsAbsence` : charge l'absence + le salarié depuis la DB,
// génère le .ics, l'écrit dans un fichier temp, ouvre via shell.openPath().
// Les requires Electron sont scopés à l'intérieur pour que ce module reste
// importable depuis Node pur (scripts/test-ics.js).

module.exports = function registerIcsHandlers(ctx, safeHandle) {
    const { app, shell } = require('electron');
    const fs = require('fs');
    const path = require('path');

    safeHandle('genererIcsAbsence', async (event, absenceId, options = {}) => {
        // Si un snapshot est fourni (cas CANCEL côté user après que l'absence ait été
        // DELETE en DB), on l'utilise au lieu de relire en base. L'absence_id passé
        // sert toujours à construire l'UID (cohérent avec le PUBLISH d'origine).
        let absence;
        if (options.absenceSnapshot) {
            absence = { id: absenceId, ...options.absenceSnapshot };
        } else {
            const absResult = await ctx.db.execute({
                sql: 'SELECT * FROM absences WHERE id = ?',
                args: [absenceId]
            });
            absence = absResult.rows[0];
            if (!absence) throw new Error(`Absence ${absenceId} introuvable`);
        }

        // Salarié : si includeName est false, on n'a pas besoin du nom — bypass DB.
        // Utile pour le CANCEL côté user où le salarié peut ne plus être chargé.
        let salarie;
        if (options.includeName === true) {
            const salResult = await ctx.db.execute({
                sql: 'SELECT nom, prenom FROM salaries WHERE id = ?',
                args: [absence.salarie_id]
            });
            salarie = salResult.rows[0];
            if (!salarie) throw new Error(`Salarié ${absence.salarie_id} introuvable`);
        } else {
            salarie = { nom: '', prenom: '' };
        }

        const content = generateIcs(absence, salarie, options);

        const method = (options.method || 'PUBLISH').toLowerCase();
        const fileName = `conges-lce-absence-${absenceId}-${method}.ics`;
        const filePath = path.join(app.getPath('temp'), fileName);
        fs.writeFileSync(filePath, content, 'utf8');

        const errMsg = await shell.openPath(filePath);
        if (errMsg) {
            console.error('[ICS] shell.openPath erreur:', errMsg);
            return { success: false, error: errMsg, filePath };
        }
        return { success: true, filePath };
    });
};

// Exports pour tests unitaires et usage direct
module.exports.generateIcs = generateIcs;
module.exports._internal = { escapeIcsText, foldLine, addDaysIso, buildAllDayEvent, buildTimedEvent };
