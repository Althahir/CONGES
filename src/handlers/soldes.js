module.exports = function registerSoldesHandlers(ctx, safeHandle) {

    safeHandle('getSoldes', async (event, salarieId, annee) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            args: [salarieId, annee]
        });
        return result.rows[0] || { salarie_id: salarieId, annee, cp_n1: 0, cp_n: 0, rtt: 0, recup_heures: 0 };
    });

    safeHandle('updateSoldes', async (event, salarieId, annee, soldes) => {
        const existing = await ctx.db.execute({
            sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            args: [salarieId, annee]
        });

        if (existing.rows[0]) {
            await ctx.db.execute({
                sql: `UPDATE soldes SET cp_n = ?, cp_n1 = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
                args: [soldes.cp_n, soldes.cp_n1, soldes.rtt, soldes.recup_heures, salarieId, annee]
            });
        } else {
            await ctx.db.execute({
                sql: `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [salarieId, annee, soldes.cp_n, soldes.cp_n1, soldes.rtt, soldes.recup_heures]
            });
        }
        return { success: true };
    });

    safeHandle('updateSoldesAfterAbsence', async (event, salarieId, annee, type, dureeJours, dureeHeures) => {
        const result = await ctx.db.execute({
            sql: 'SELECT * FROM soldes WHERE salarie_id = ? AND annee = ?',
            args: [salarieId, annee]
        });
        const soldes = result.rows[0];

        if (!soldes) throw new Error('Soldes introuvables');

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

        await ctx.db.execute({
            sql: `UPDATE soldes SET cp_n1 = ?, cp_n = ?, rtt = ?, recup_heures = ?, derniere_maj = CURRENT_TIMESTAMP WHERE salarie_id = ? AND annee = ?`,
            args: [nouveauCPN1, nouveauCPN, nouveauRTT, nouveauRecup, salarieId, annee]
        });

        return { success: true, cp_n1: nouveauCPN1, cp_n: nouveauCPN, rtt: nouveauRTT, recup_heures: nouveauRecup };
    });

};
