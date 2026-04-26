// Stockage local des mots de passe via Electron safeStorage (DPAPI sous Windows)
// Les mots de passe sont chiffrés à la session utilisateur Windows : copier le fichier sur un autre poste
// ou une autre session Windows ne permet pas de les déchiffrer.

const { app, safeStorage } = require('electron');
const fs = require('fs').promises;
const path = require('path');

function credFile() {
    return path.join(app.getPath('userData'), 'saved-credentials.json');
}

async function readAll() {
    try {
        const content = await fs.readFile(credFile(), 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return {};
    }
}

async function writeAll(data) {
    await fs.writeFile(credFile(), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = function registerCredentialsHandlers(ctx, safeHandle) {

    safeHandle('saveCredential', async (event, email, password) => {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Stockage chiffré indisponible sur ce système');
        }
        if (!email || !password) {
            throw new Error('Email et mot de passe requis');
        }
        const all = await readAll();
        const buf = safeStorage.encryptString(password);
        all[email.toLowerCase()] = buf.toString('base64');
        await writeAll(all);
        return { success: true };
    });

    safeHandle('getCredential', async (event, email) => {
        if (!email || !safeStorage.isEncryptionAvailable()) return null;
        const all = await readAll();
        const enc = all[email.toLowerCase()];
        if (!enc) return null;
        try {
            const buf = Buffer.from(enc, 'base64');
            return safeStorage.decryptString(buf);
        } catch (e) {
            console.error('[credentials] Erreur déchiffrement:', e.message);
            return null;
        }
    });

    safeHandle('deleteCredential', async (event, email) => {
        if (!email) return { success: true };
        const all = await readAll();
        const key = email.toLowerCase();
        if (all[key]) {
            delete all[key];
            await writeAll(all);
        }
        return { success: true };
    });

    safeHandle('hasCredential', async (event, email) => {
        if (!email) return false;
        const all = await readAll();
        return Boolean(all[email.toLowerCase()]);
    });

};
