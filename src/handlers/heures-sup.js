module.exports = function registerHeuresSupHandlers(ctx, safeHandle) {

    async function ajusterSoldeRecup(salarieId, annee, delta) {
        const existant = await ctx.db.execute({
            sql: `SELECT id FROM soldes WHERE salarie_id = ? AND annee = ?`,
            args: [salarieId, annee]
        });
        if (existant.rows[0]) {
            await ctx.db.execute({
                sql: `UPDATE soldes SET recup_heures = recup_heures + ?, derniere_maj = CURRENT_TIMESTAMP
                      WHERE salarie_id = ? AND annee = ?`,
                args: [delta, salarieId, annee]
            });
        } else {
            await ctx.db.execute({
                sql: `INSERT INTO soldes (salarie_id, annee, cp_n, cp_n1, rtt, recup_heures) VALUES (?, ?, 0, 0, 0, ?)`,
                args: [salarieId, annee, delta]
            });
        }
    }

    function formatDateFr(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR');
    }

    safeHandle('ajouter-recup', async (event, data) => {
        const { salarie_id, annee, heures, date, commentaire, source, autoValide } = data;

        // Filet : un retrait manuel (saisie de récup prise) est plafonné à 2h30.
        // Au-delà, l'utilisateur doit poser une demi-journée via le formulaire d'absence.
        // Les imports Excel ne sont pas concernés (peuvent contenir des saisies historiques).
        if ((source || 'manuel') === 'manuel' && heures < -2.5) {
            throw new Error('Une saisie de récup en heures ne peut pas dépasser 2h30. Posez une demi-journée à la place.');
        }

        // Filet : pas de retrait un week-end, un jour férié, ou un jour déjà couvert par une absence (sauf import historique)
        if ((source || 'manuel') === 'manuel' && heures < 0) {
            const [y, m, d] = date.split('-').map(Number);
            const dayOfWeek = new Date(y, m - 1, d).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                throw new Error('Impossible de poser une absence un week-end.');
            }
            const ferieRes = await ctx.db.execute({
                sql: 'SELECT libelle FROM jours_feries WHERE date = ? AND annee = ?',
                args: [date, y]
            });
            if (ferieRes.rows[0]) {
                throw new Error(`Impossible de poser une absence un jour férié (${ferieRes.rows[0].libelle}).`);
            }
            // Cherche une absence qui couvre la journée *complètement* (les demi-journées sont OK)
            const absRes = await ctx.db.execute({
                sql: `SELECT id, date_debut, date_fin, debut_periode, fin_periode FROM absences
                      WHERE salarie_id = ? AND statut IN ('valide', 'en_attente')
                        AND date_debut <= ? AND date_fin >= ?`,
                args: [salarie_id, date, date]
            });
            const conflit = absRes.rows.find(a => {
                // Si la date est strictement entre debut et fin, c'est un jour intermédiaire = plein
                if (date > a.date_debut && date < a.date_fin) return true;
                // Si même jour de début : partiel uniquement si on commence l'après-midi
                if (date === a.date_debut && a.debut_periode === 'apres-midi') return false;
                // Si même jour de fin : partiel uniquement si on s'arrête midi
                if (date === a.date_fin && a.fin_periode === 'midi') return false;
                return true;
            });
            if (conflit) {
                throw new Error('Une absence couvre déjà toute la journée.');
            }
        }

        // Workflow de validation : seuls les retraits (récup posée) passent par en_attente.
        // Les crédits (heures sup faites) sont validés immédiatement.
        // Les imports Excel et l'autoValide (admin pour soi) court-circuitent aussi.
        const estRetrait = heures < 0;
        const sourceFinale = source || 'manuel';
        const passeParValidation = estRetrait && sourceFinale === 'manuel' && !autoValide;
        const statut = passeParValidation ? 'en_attente' : 'valide';
        const dateValidation = passeParValidation ? null : new Date().toISOString();

        const insertResult = await ctx.db.execute({
            sql: `INSERT INTO heures_supplementaires (salarie_id, date, heures, commentaire, source, statut, date_validation) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [salarie_id, date, heures, commentaire || null, sourceFinale, statut, dateValidation]
        });
        const saisieId = Number(insertResult.lastInsertRowid);

        // Le solde n'est ajusté qu'au moment de la validation (cf. validerHeureSup).
        // Pour les saisies validées immédiatement (crédits + autoValide + imports), on ajuste tout de suite.
        if (statut === 'valide') {
            await ajusterSoldeRecup(salarie_id, annee, heures);
        }

        // Notif globale aux admins quand une demande passe en attente
        if (statut === 'en_attente') {
            try {
                const salarieRes = await ctx.db.execute({
                    sql: 'SELECT nom, prenom FROM salaries WHERE id = ?',
                    args: [salarie_id]
                });
                const salarie = salarieRes.rows[0];
                const heuresAbs = Math.abs(heures);
                const titre = `Nouvelle demande de récup`;
                const message = `${salarie ? salarie.prenom + ' ' + salarie.nom : 'Salarié'} — ${heuresAbs}h le ${formatDateFr(date)}`;

                if (ctx.mainWindow && ctx.mainWindow.webContents) {
                    ctx.mainWindow.webContents.send('traitement-automatique', {
                        type: 'demande_recup',
                        titre,
                        message,
                        statut: 'info'
                    });
                }
            } catch (e) { console.error('Erreur notif demande recup:', e); }
        }

        return { success: true, id: saisieId, statut };
    });

    safeHandle('getHeuresSup', async (event, salarie_id) => {
        const result = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE salarie_id = ? AND statut != 'refuse' ORDER BY date DESC`,
            args: [salarie_id]
        });
        return result.rows;
    });

    // Toutes les saisies de tous les salariés (pour le calendrier global)
    safeHandle('getAllHeuresSup', async (event) => {
        const result = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE statut != 'refuse' ORDER BY date DESC`,
            args: []
        });
        return result.rows;
    });

    // Liste des demandes de récup en attente (admin) — avec infos salarié
    safeHandle('getHeuresSupEnAttente', async (event) => {
        const result = await ctx.db.execute({
            sql: `SELECT h.*, s.nom, s.prenom FROM heures_supplementaires h
                  JOIN salaries s ON h.salarie_id = s.id
                  WHERE h.statut = 'en_attente'
                  ORDER BY h.date_creation DESC`,
            args: []
        });
        return result.rows;
    });

    // Union heures_supplementaires + absences RECUP (lecture seule pour ces dernières)
    safeHandle('getHistoriqueRecupComplet', async (event, salarie_id) => {
        const hsupRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE salarie_id = ? AND statut != 'refuse'`,
            args: [salarie_id]
        });
        const absRes = await ctx.db.execute({
            sql: `SELECT * FROM absences WHERE salarie_id = ? AND type = 'RECUP' AND statut = 'valide'`,
            args: [salarie_id]
        });

        const hsupRows = hsupRes.rows.map(h => ({
            ...h,
            _origine: 'heures_sup'
        }));

        const absRows = absRes.rows.map(a => {
            const debutFr = new Date(a.date_debut).toLocaleDateString('fr-FR');
            const finFr = new Date(a.date_fin).toLocaleDateString('fr-FR');
            const periodeTxt = a.date_debut === a.date_fin ? debutFr : `${debutFr} → ${finFr}`;
            const dureeTxt = a.duree_jours ? `${Number(a.duree_jours).toFixed(2)} jour(s)` : '';
            const baseComm = `Pose congé · ${periodeTxt}${dureeTxt ? ' · ' + dureeTxt : ''}`;
            const commentaire = a.commentaire ? `${baseComm} · ${a.commentaire}` : baseComm;
            return {
                id: `abs_${a.id}`,
                _absenceId: a.id,
                salarie_id: a.salarie_id,
                date: a.date_debut,
                heures: -Number(a.duree_heures || (a.duree_jours * 7) || 0),
                commentaire,
                date_creation: a.date_creation,
                source: 'pose_conge',
                _origine: 'absence_recup'
            };
        });

        const merged = [...hsupRows, ...absRows];
        merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        return merged;
    });

    safeHandle('updateHeureSup', async (event, payload) => {
        const { id, date, heures, commentaire, actorId } = payload;

        const oldRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });
        const old = oldRes.rows[0];
        if (!old) throw new Error('Heure de récupération introuvable');

        const ancienneAnnee = new Date(old.date).getFullYear();
        const nouvelleAnnee = new Date(date).getFullYear();
        const ancienHeures = Number(old.heures);
        const nouvelHeures = Number(heures);

        // Si la saisie est en_attente, le solde n'a pas encore été ajusté → rien à reculer.
        // Sinon, on applique le delta (ou ré-équilibre si l'année change).
        if (old.statut === 'valide') {
            if (ancienneAnnee === nouvelleAnnee) {
                const delta = nouvelHeures - ancienHeures;
                if (delta !== 0) await ajusterSoldeRecup(old.salarie_id, nouvelleAnnee, delta);
            } else {
                await ajusterSoldeRecup(old.salarie_id, ancienneAnnee, -ancienHeures);
                await ajusterSoldeRecup(old.salarie_id, nouvelleAnnee, nouvelHeures);
            }
        }

        await ctx.db.execute({
            sql: `UPDATE heures_supplementaires SET date = ?, heures = ?, commentaire = ? WHERE id = ?`,
            args: [date, nouvelHeures, commentaire || null, id]
        });

        const details = `Saisie #${id} : ${ancienHeures}h du ${formatDateFr(old.date)} → ${nouvelHeures}h du ${formatDateFr(date)}`;
        await ctx.db.execute({
            sql: `INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut)
                  VALUES ('RECUP_MODIF', ?, 1, ?, 'success')`,
            args: [nouvelleAnnee, details]
        });

        // Pas de notif DB si l'acteur est lui-même le salarié concerné (auto-action,
        // toast UI direct fait déjà office de feedback).
        if (!actorId || actorId !== old.salarie_id) {
            await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id)
                      VALUES ('recup_modifiee', ?, ?, 'success', ?)`,
                args: [
                    'Heures de récupération modifiées',
                    `Votre saisie de ${ancienHeures}h du ${formatDateFr(old.date)} a été modifiée en ${nouvelHeures}h du ${formatDateFr(date)}.`,
                    old.salarie_id
                ]
            });
        }

        return { success: true };
    });

    safeHandle('deleteHeureSup', async (event, idOrPayload) => {
        const id = typeof idOrPayload === 'object' ? idOrPayload.id : idOrPayload;
        const actorId = typeof idOrPayload === 'object' ? idOrPayload.actorId : undefined;

        // DELETE atomique avec RETURNING (évite la race condition admin-valide / user-supprime)
        const delRes = await ctx.db.execute({
            sql: `DELETE FROM heures_supplementaires WHERE id = ? RETURNING *`,
            args: [id]
        });
        const old = delRes.rows[0];
        if (!old) throw new Error('Heure de récupération introuvable');

        const annee = new Date(old.date).getFullYear();
        const heures = Number(old.heures);

        // Le solde n'a été ajusté qu'au moment de la validation. Si encore en_attente, rien à recréditer.
        if (old.statut === 'valide') {
            await ajusterSoldeRecup(old.salarie_id, annee, -heures);
        }

        const details = `Saisie #${id} : ${heures}h du ${formatDateFr(old.date)}${old.commentaire ? ' (' + old.commentaire + ')' : ''}`;
        await ctx.db.execute({
            sql: `INSERT INTO historique_traitements (type, annee, nb_salaries_traites, details, statut)
                  VALUES ('RECUP_SUPPR', ?, 1, ?, 'success')`,
            args: [annee, details]
        });

        // Pas de notif DB si l'acteur est lui-même le salarié concerné (auto-action).
        if (!actorId || actorId !== old.salarie_id) {
            await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id)
                      VALUES ('recup_supprimee', ?, ?, 'success', ?)`,
                args: [
                    'Heures de récupération supprimées',
                    `Votre saisie de ${heures}h du ${formatDateFr(old.date)} a été supprimée.`,
                    old.salarie_id
                ]
            });
        }

        // Si la saisie était en attente, prévenir les admins pour rafraîchir le bandeau Validation
        if (old.statut === 'en_attente' && ctx.mainWindow && ctx.mainWindow.webContents) {
            ctx.mainWindow.webContents.send('traitement-automatique', {
                type: 'demande_supprimee',
                titre: 'Demande retirée',
                message: 'Une demande de récup en attente a été retirée par le salarié.',
                statut: 'info'
            });
        }

        return { success: true };
    });

    // Validation d'une demande de récup → décrémente le solde + notif user
    safeHandle('validerHeureSup', async (event, payload) => {
        const id = typeof payload === 'object' ? payload.id : payload;
        const adminId = typeof payload === 'object' ? payload.adminId : undefined;

        // UPDATE conditionnel : on ne valide que si la demande est encore en_attente
        const upd = await ctx.db.execute({
            sql: `UPDATE heures_supplementaires SET statut = 'valide', date_validation = CURRENT_TIMESTAMP, validee_par = ? WHERE id = ? AND statut = 'en_attente'`,
            args: [adminId || null, id]
        });
        if (Number(upd.rowsAffected) === 0) {
            throw new Error('Demande introuvable ou déjà traitée (probablement retirée par le salarié).');
        }

        // Relit la ligne maintenant en 'valide' pour ajuster le solde + notif
        const oldRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });
        const old = oldRes.rows[0];
        if (!old) throw new Error('Saisie introuvable après validation');

        const annee = new Date(old.date).getFullYear();
        const heures = Number(old.heures);
        await ajusterSoldeRecup(old.salarie_id, annee, heures);

        // Notif ciblée user
        try {
            const heuresAbs = Math.abs(heures);
            const titre = `Demande de récup validée ✓`;
            const message = `Votre demande de ${heuresAbs}h du ${formatDateFr(old.date)} a été validée.`;
            const insRes = await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id) VALUES ('recup_validee', ?, ?, 'success', ?)`,
                args: [titre, message, old.salarie_id]
            });
            const notifId = Number(insRes.lastInsertRowid);
            if (ctx.mainWindow && ctx.mainWindow.webContents) {
                ctx.mainWindow.webContents.send('traitement-automatique', {
                    id: notifId, type: 'recup_validee', titre, message, statut: 'success', user_id: old.salarie_id
                });
            }
        } catch (errNotif) {
            console.error('Erreur notif validerHeureSup:', errNotif);
        }

        return { success: true };
    });

    // Refus d'une demande de récup → pas de débit + notif user
    safeHandle('refuserHeureSup', async (event, payload) => {
        const id = typeof payload === 'object' ? payload.id : payload;
        const adminId = typeof payload === 'object' ? payload.adminId : undefined;

        // UPDATE conditionnel : abort si déjà traitée ou supprimée
        const upd = await ctx.db.execute({
            sql: `UPDATE heures_supplementaires SET statut = 'refuse', date_validation = CURRENT_TIMESTAMP, validee_par = ? WHERE id = ? AND statut = 'en_attente'`,
            args: [adminId || null, id]
        });
        if (Number(upd.rowsAffected) === 0) {
            throw new Error('Demande introuvable ou déjà traitée (probablement retirée par le salarié).');
        }

        const oldRes = await ctx.db.execute({
            sql: `SELECT * FROM heures_supplementaires WHERE id = ?`,
            args: [id]
        });
        const old = oldRes.rows[0];
        if (!old) throw new Error('Saisie introuvable après refus');

        try {
            const heuresAbs = Math.abs(Number(old.heures));
            const titre = `Demande de récup refusée ✕`;
            const message = `Votre demande de ${heuresAbs}h du ${formatDateFr(old.date)} a été refusée.`;
            const insRes = await ctx.db.execute({
                sql: `INSERT INTO notifications (type, titre, message, statut, user_id) VALUES ('recup_refusee', ?, ?, 'error', ?)`,
                args: [titre, message, old.salarie_id]
            });
            const notifId = Number(insRes.lastInsertRowid);
            if (ctx.mainWindow && ctx.mainWindow.webContents) {
                ctx.mainWindow.webContents.send('traitement-automatique', {
                    id: notifId, type: 'recup_refusee', titre, message, statut: 'error', user_id: old.salarie_id
                });
            }
        } catch (errNotif) {
            console.error('Erreur notif refuserHeureSup:', errNotif);
        }

        return { success: true };
    });

};
