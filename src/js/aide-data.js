// Contenu statique de l'aide admin — modale "?" du header.
// Pour modifier une fiche : éditer le HTML directement, recharger l'app (npm start) ou redémarrer en prod.
//
// ⚠️ RÈGLE PROJET : à chaque modification de code qui change un flow admin user-facing
// (suppression congé, validation, modale, raccourci, règle métier, emplacement de bouton...),
// METTRE À JOUR LA FICHE CONCERNÉE ICI DANS LE MÊME COMMIT.
// Une FAQ qui diverge du code génère du support inutile et perd la confiance des utilisateurs.

window.AIDE_DATA = [
    {
        id: 'suppression',
        titre: "Supprimer un congé déjà validé",
        motsCles: ['suppression', 'supprimer', 'annuler', 'congé', 'pdf', 'annulation', 'rollback', 'recréditer', 'corbeille', 'réaffectation', 'réaffecter', 'cp_n', 'cp_n1', 'répartition'],
        contenu: `
<h3>Supprimer un congé déjà validé</h3>

<h4>Procédure complète</h4>
<ol>
  <li>Aller dans la section <strong>Validation</strong> (icône <i class="fa-solid fa-clipboard-check"></i>).</li>
  <li>Sélectionner le <strong>salarié concerné</strong> dans la liste.</li>
  <li>Sur le calendrier historique, <strong>cliquer sur un jour</strong> du congé à supprimer.</li>
  <li><strong>Étape 1 — Suppression</strong> :
    <ul>
      <li>Choisir <strong>« Supprimer toute la période »</strong> ou <strong>« Supprimer ce jour seul »</strong>.</li>
      <li>Cocher <strong>« Générer un PDF d'annulation »</strong> si le dossier officiel doit être mis à jour (disponible aussi bien pour la période complète que pour un jour seul).</li>
      <li>Cliquer <strong>Confirmer la suppression</strong>.</li>
    </ul>
  </li>
  <li><strong>Étape 2 — Répartition du recrédit</strong> (uniquement pour les CP) :
    <ul>
      <li>L'info en haut rappelle la décomposition d'origine de la période (ex. « 3 jours sur CP N-1 et 2 jours sur CP N »).</li>
      <li>Saisir le nombre de jours à remettre sur <strong>CP N-1</strong> et sur <strong>CP N</strong>.</li>
      <li>Le total doit valoir exactement le nombre de jours à recréditer (le bouton Confirmer reste désactivé tant que ce n'est pas le cas).</li>
      <li>Cliquer <strong>Confirmer le recrédit</strong> pour finaliser, ou <strong>Annuler</strong> pour revenir en arrière sans rien modifier (l'absence reste intacte).</li>
    </ul>
  </li>
</ol>

<h4>Quand changer la répartition par défaut ?</h4>
<p>Cas typique du <strong>basculement annuel</strong> : un congé posé en mai a été débité prioritairement sur CP N-1 (qui se vide avant le 31 mai). Tu l'annules en juin, après le basculement annuel. CP N-1 a déjà été remis à zéro pour la nouvelle période. Tu vas vouloir remettre les jours sur <strong>CP N</strong> plutôt que sur CP N-1 qui n'a plus de sens.</p>
<p>À l'étape 2, tu es libre du choix : à l'identique (pré-rempli), tout sur CP N-1, tout sur CP N, ou un mix.</p>

<h4>Cas particuliers</h4>
<ul>
  <li><strong>Suppression d'un jour seul d'une période multi-jours</strong> : à l'étape 2 on demande où remettre <strong>1 jour</strong> (pas la totalité). Tu vois quand même la décomposition d'origine de la période complète pour t'aider à choisir. La sous-absence raccourcie est recréée automatiquement.</li>
  <li><strong>Suppression d'un jour au milieu</strong> : la période est coupée en deux sous-absences. Le recrédit du jour cliqué se fait selon ton choix. La décomposition restante est répartie automatiquement entre les deux morceaux.</li>
  <li><strong>Demande encore en attente</strong> (pas validée) : pas d'étape 2 (rien n'a été débité). Le salarié peut aussi l'annuler lui-même depuis son panneau « Mes demandes en cours ».</li>
  <li><strong>Demande refusée</strong> : déjà supprimée logiquement, n'apparaît plus dans le calendrier ni l'historique.</li>
  <li><strong>Absence MALADIE / RTT / RECUP</strong> : pas d'étape 2 (la répartition CP N-1 / CP N ne s'applique pas). Le recrédit est automatique comme avant.</li>
</ul>

<h4>PDF d'annulation</h4>
<ul>
  <li>Coché → un PDF rouge « ANNULATION DE CONGÉS » est enregistré automatiquement dans <code>OneDrive\\LA CIOTAT ENTREPRENDRE - DONNEES\\17 DOSSIERS SALARIES\\CONGES\\PDF\\</code> après le recrédit.</li>
  <li>Disponible pour la <strong>suppression complète</strong> (PDF couvrant toute la période) et pour la <strong>suppression d'un jour seul</strong> (PDF du jour annulé uniquement).</li>
</ul>

<h4>Notification au salarié</h4>
<p>À chaque suppression d'une absence validée, le salarié concerné reçoit automatiquement une notification (vert) sur son dashboard :</p>
<ul>
  <li>Message : « Absence du JJ/MM au JJ/MM supprimée par l'administrateur. Soldes mis à jour. »</li>
  <li>Si le salarié est connecté, la notification apparaît en direct ; sinon elle l'attend à sa prochaine connexion.</li>
  <li>Si l'admin supprime sa propre absence, aucune notification n'est envoyée.</li>
</ul>

<p class="aide-tip"><i class="fa-solid fa-circle-info"></i> <strong>Important :</strong> à l'étape 2, le bouton « Confirmer le recrédit » est désactivé tant que la somme CP N-1 + CP N ne vaut pas exactement le total à recréditer. Le bouton « Annuler » reste toujours disponible pour revenir en arrière sans rien modifier — rien n'est encore enregistré avant la confirmation.</p>
`
    },

    {
        id: 'fix-soldes',
        titre: "Remettre les soldes à jour après une erreur de calcul",
        motsCles: ['solde', 'erreur', 'calcul', 'correction', 'rectifier', 'rectification', 'debug', 'ctrl', 'db', 'browser', 'manuel', 'cp_n', 'cp_n1', 'rtt', 'recup'],
        contenu: `
<h3>Remettre les soldes à jour après une erreur de calcul</h3>
<p>Si un solde affiché ne correspond pas à la réalité (écart avec le bulletin de paie, erreur de calcul lors d'un traitement, modification manuelle douteuse...), tu peux le corriger directement en base via le <strong>DB Browser</strong>.</p>

<h4>Cas où ce correctif est utile</h4>
<ul>
  <li>Le bulletin de paie indique <strong>X jours</strong>, mais l'app affiche <strong>X ± ε</strong> → écart à rectifier.</li>
  <li>Un <strong>traitement CP mensuel</strong> a été calculé avec un mauvais taux (cas Emilie REDOUTE en arrêt maladie sans entrée <code>historique_taux</code>).</li>
  <li>Un import Excel a injecté un solde initial erroné.</li>
  <li>Une suppression d'absence n'a pas correctement recrédité le solde (cas rare avec d'anciennes absences sans décomposition mémorisée).</li>
</ul>

<h4>Procédure</h4>
<ol>
  <li>Tape <kbd>Ctrl</kbd>+<kbd>D</kbd>+<kbd>E</kbd>+<kbd>B</kbd>+<kbd>U</kbd>+<kbd>G</kbd> en maintenant Ctrl enfoncé. La fenêtre <strong>DB Browser</strong> s'ouvre.</li>
  <li>Sélectionner la table <strong><code>soldes</code></strong> dans la liste de gauche.</li>
  <li>Repérer la ligne du salarié + année concernée :
    <ul>
      <li>Filtrer par <code>salarie_id</code> ou faire défiler jusqu'à la ligne.</li>
      <li>Vérifier que <code>annee</code> correspond bien à la période à corriger.</li>
    </ul>
  </li>
  <li><strong>Double-cliquer</strong> sur la cellule à modifier (<code>cp_n</code>, <code>cp_n1</code>, <code>rtt</code> ou <code>recup_heures</code>).</li>
  <li>Saisir la nouvelle valeur, valider avec <kbd>Entrée</kbd>.</li>
  <li>Fermer la fenêtre → l'app rafraîchit les vues automatiquement (soldes, calendriers, tuiles).</li>
</ol>

<h4>Cas spécial : salarié en arrêt maladie sans <code>historique_taux</code></h4>
<p>Si le calcul CP mensuel donne un mauvais taux pour un salarié en arrêt, le garde-fou couvre les futurs traitements, mais pas les soldes déjà calculés. Pour rectifier :</p>
<ol>
  <li>Ouvrir la table <strong><code>historique_taux</code></strong>.</li>
  <li>Vérifier qu'une entrée existe pour ce salarié avec la date d'effet de l'arrêt.</li>
  <li>Si absente, <strong>« Ajouter une ligne »</strong> avec : <code>salarie_id</code>, <code>date_effet</code> (= date d'arrêt), <code>ancien_taux = 'normal'</code>, <code>nouveau_taux = 'arret'</code>.</li>
  <li>Puis corriger le solde dans <code>soldes</code> de l'écart cumulé (taux normal − taux arrêt = 0.42 j/mois × nb mois).</li>
</ol>

<h4>SQL libre (avancé)</h4>
<p>Le DB Browser propose aussi un onglet <strong>« SQL libre »</strong> pour exécuter des requêtes complexes :</p>
<pre><code>-- Vérifier l'état avant correction
SELECT s.id, s.nom, s.prenom, sol.cp_n, sol.cp_n1
FROM salaries s
JOIN soldes sol ON sol.salarie_id = s.id
WHERE s.id = 5 AND sol.annee = 2026;

-- Rectifier en une requête (exemple)
UPDATE soldes SET cp_n = cp_n - 0.42 WHERE salarie_id = 5 AND annee = 2026;</code></pre>

<h4>Vérifications post-correctif</h4>
<ul>
  <li>Rouvrir la fiche du salarié dans la section <strong>Salariés</strong> ou <strong>Validation</strong> : les tuiles soldes affichent la nouvelle valeur.</li>
  <li>Recroiser avec le bulletin de paie ou la source de vérité.</li>
  <li>Si le correctif concerne un mois passé, prévenir le salarié si l'écart est visible côté user.</li>
</ul>

<p class="aide-tip"><i class="fa-solid fa-triangle-exclamation"></i> <strong>Précautions :</strong></p>
<ul>
  <li>Le DB Browser n'a <strong>aucun garde-fou</strong> — pas de validation des valeurs, pas d'historique, pas de notification au salarié.</li>
  <li>Toujours <strong>vérifier deux fois</strong> avant de valider une modification (l'undo n'existe pas).</li>
  <li>Pour un changement de statut <strong>arrêt maladie</strong>, ne JAMAIS toucher <code>salaries.en_arret_maladie</code> en SQL — passer par la fiche UI (qui ajoute automatiquement la ligne <code>historique_taux</code>).</li>
  <li>Si possible, prendre une <strong>capture d'écran</strong> de l'état avant modification pour traçabilité.</li>
</ul>
`
    }
];
