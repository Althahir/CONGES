function calculerJoursOuvres(dateDebut, dateFin, joursFeries) {
    console.log('=== CALCUL JOURS OUVRES ===');
    console.log('dateDebut reçu:', dateDebut);
    console.log('dateFin reçu:', dateFin);

    let joursOuvres = 0;

    const feriesSet = new Set(joursFeries.map(f => f.date));

    const [anneeD, moisD, jourD] = dateDebut.split('-').map(Number);
    const [anneeF, moisF, jourF] = dateFin.split('-').map(Number);

    let currentDate = new Date(Date.UTC(anneeD, moisD - 1, jourD, 12, 0, 0));
    const endDate = new Date(Date.UTC(anneeF, moisF - 1, jourF, 12, 0, 0));

    while (currentDate <= endDate) {
        const year = currentDate.getUTCFullYear();
        const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getUTCDate()).padStart(2, '0');
        const dateISO = `${year}-${month}-${day}`;
        const dayOfWeek = currentDate.getUTCDay();

        console.log(`Jour: ${dateISO}, dayOfWeek: ${dayOfWeek}, férié: ${feriesSet.has(dateISO)}`);

        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            if (!feriesSet.has(dateISO)) {
                joursOuvres++;
            }
        }

        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log('Total jours ouvrés:', joursOuvres);

    return joursOuvres;
}

module.exports = function registerCalculHandlers(ctx, safeHandle) {

    safeHandle('calculerDuree', async (event, dateDebut, dateFin, debutPeriode, finPeriode) => {
        return new Promise((resolve, reject) => {
            const anneeDebut = new Date(dateDebut).getFullYear();
            const anneeFin = new Date(dateFin).getFullYear();

            ctx.db.all(
                'SELECT date FROM jours_feries WHERE annee IN (?, ?)',
                [anneeDebut, anneeFin],
                (err, joursFeries) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const joursOuvres = calculerJoursOuvres(dateDebut, dateFin, joursFeries);

                    let dureeJours = joursOuvres;
                    if (debutPeriode === 'apres-midi') {
                        dureeJours -= 0.5;
                    }
                    if (finPeriode === 'midi') {
                        dureeJours -= 0.5;
                    }
                    if (dureeJours < 0) dureeJours = 0;

                    resolve({
                        joursOuvres: joursOuvres,
                        dureeJours: dureeJours,
                        joursFeries: joursFeries.length
                    });
                }
            );
        });
    });

};
