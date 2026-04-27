/**
 * Synchronise la DB Turso de production vers le fichier SQLite local DOCS/conges.db.
 *
 * Usage : node scripts/dump-turso-to-local.js
 *
 * Lit la config Turso depuis :
 *   1. Variables d'env TURSO_URL + TURSO_AUTH_TOKEN (prioritaire)
 *   2. %APPDATA%/conges-lce/config.json (fallback)
 *
 * Effets :
 *   - Backup automatique de DOCS/conges.db existante en DOCS/conges.db.bak (si présente)
 *   - Recrée DOCS/conges.db à l'identique de Turso : schémas (tables + indexes) + toutes les lignes
 */

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadTursoCredentials() {
    if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
        return { url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN };
    }
    const configPath = path.join(os.homedir(), 'AppData', 'Roaming', 'conges-lce', 'config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config Turso introuvable. Définir TURSO_URL + TURSO_AUTH_TOKEN ou créer ${configPath}`);
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!cfg.tursoUrl || !cfg.tursoToken) {
        throw new Error(`config.json incomplet : besoin de tursoUrl + tursoToken`);
    }
    return { url: cfg.tursoUrl, authToken: cfg.tursoToken };
}

async function main() {
    const creds = loadTursoCredentials();
    const turso = createClient(creds);

    const localPath = path.resolve(__dirname, '..', 'DOCS', 'conges.db');

    if (fs.existsSync(localPath)) {
        const bakPath = localPath + '.bak';
        fs.copyFileSync(localPath, bakPath);
        console.log(`Backup : ${bakPath}`);
        fs.unlinkSync(localPath);
    }

    const local = createClient({ url: `file:${localPath}` });

    console.log('--- Récupération du schéma Turso ---');
    const schemasResult = await turso.execute(
        `SELECT type, name, sql FROM sqlite_master
         WHERE sql IS NOT NULL
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE 'libsql_%'
           AND name NOT LIKE '_litestream_%'
         ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name`
    );

    const tables = schemasResult.rows.filter(r => r.type === 'table');
    const indexes = schemasResult.rows.filter(r => r.type === 'index');
    const others = schemasResult.rows.filter(r => r.type !== 'table' && r.type !== 'index');

    console.log(`${tables.length} table(s), ${indexes.length} index, ${others.length} autre(s)`);

    // 1. Créer les tables
    for (const t of tables) {
        await local.execute(t.sql);
        console.log(`  + table ${t.name}`);
    }

    // 2. Désactiver FK le temps d'insérer (Turso ne les vérifie pas, SQLite local oui)
    await local.execute('PRAGMA foreign_keys = OFF');

    // 3. Copier les données
    let totalRows = 0;
    for (const t of tables) {
        const data = await turso.execute(`SELECT * FROM ${t.name}`);
        if (data.rows.length === 0) {
            console.log(`  · ${t.name} : 0 ligne`);
            continue;
        }
        const cols = data.columns;
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO ${t.name} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
        const batch = [];
        for (const row of data.rows) {
            batch.push({ sql, args: cols.map(c => row[c]) });
        }
        await local.batch(batch, 'write');
        console.log(`  · ${t.name} : ${data.rows.length} ligne(s)`);
        totalRows += data.rows.length;
    }

    // 4. Créer les indexes (après les données pour gagner du temps)
    for (const idx of indexes) {
        await local.execute(idx.sql);
        console.log(`  + index ${idx.name}`);
    }

    // 5. Autres objets (triggers, views) le cas échéant
    for (const o of others) {
        await local.execute(o.sql);
        console.log(`  + ${o.type} ${o.name}`);
    }

    // 6. Vérifier l'intégrité FK puis réactiver
    const fkCheck = await local.execute('PRAGMA foreign_key_check');
    if (fkCheck.rows.length > 0) {
        console.warn(`⚠️  ${fkCheck.rows.length} violation(s) de FK détectée(s) — données copiées telles quelles depuis Turso :`);
        for (const v of fkCheck.rows.slice(0, 10)) console.warn('   ', v);
    }
    await local.execute('PRAGMA foreign_keys = ON');

    console.log(`\n✅ Synchronisation terminée — ${tables.length} table(s), ${totalRows} ligne(s) au total`);
    console.log(`   ${localPath}`);
}

main().catch(err => {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
});
