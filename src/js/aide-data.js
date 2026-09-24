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
        motsCles: ['suppression', 'supprimer', 'annuler', 'congé', 'pdf', 'annulation', 'rollback', 'recréditer', 'corbeille', 'réaffectation', 'réaffecter', 'cp_n', 'cp_n1', 'répartition', 'outlook', 'calendrier', 'ics'],
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
      <li>Cocher <strong>« Retirer également de mon calendrier Outlook »</strong> (visible si la sync Outlook est activée dans les Paramètres) pour que l'event correspondant soit supprimé. En cas de suppression d'un jour seul d'une période multi-jours, l'event original est retiré et les sous-périodes restantes sont automatiquement ré-ouvertes dans Outlook.</li>
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
  <li>Un bouton <strong>« Retirer de mon calendrier »</strong> apparaît dans le toast pour annuler l'event Outlook côté son poste (depuis v1.2, la sync calendrier est universelle — tous les salariés reçoivent un ICS dès la pose).</li>
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
    },

    {
        id: 'traitements-auto',
        titre: "Traitements automatiques : acquisition des CP et basculement annuel",
        motsCles: ['traitement', 'traitements', 'automatique', 'mensuel', 'acquisition', 'cp mensuel', 'basculement', 'annuel', 'rtt', 'rattrapage', 'manqué', 'oublié', '1er du mois', 'solde faux', 'écart paie', 'bulletin'],
        contenu: `
<h3>Traitements automatiques : acquisition des CP et basculement annuel</h3>

<h4>Ce qui tourne tout seul</h4>
<ul>
  <li><strong>Acquisition CP mensuelle</strong> — le 1<sup>er</sup> de chaque mois, l'application crédite les congés acquis sur le <strong>mois écoulé</strong> (2,08333 j au taux normal, 1,66333 j en arrêt maladie). Le mois de septembre est donc crédité le 1<sup>er</sup> octobre.</li>
  <li><strong>Basculement annuel CP</strong> — le 1<sup>er</sup> juin, les CP N sont transférés en CP N-1 et le compteur CP N repart de zéro.</li>
  <li><strong>Attribution des RTT</strong> — le 1<sup>er</sup> juin également, selon les paramètres RTT de l'année saisis dans les Paramètres.</li>
</ul>

<h4>Et si personne n'ouvre l'application le 1<sup>er</sup> du mois ?</h4>
<p><strong>Rien n'est perdu.</strong> L'application ne se demande plus « sommes-nous le 1<sup>er</sup> ? » mais « quelles échéances sont passées sans avoir été traitées ? ». Au prochain démarrage, tous les mois manqués sont rattrapés automatiquement, dans l'ordre chronologique.</p>
<p>Exemple : le 1<sup>er</sup> août 2026 tombait un samedi, bureau fermé. Auparavant, l'acquisition de juillet était perdue définitivement et il fallait s'en apercevoir en comparant avec les bulletins de paie. Désormais, l'ouverture de l'application le lundi suivant crédite juillet normalement.</p>
<p>La vérification a lieu <strong>au démarrage</strong> puis <strong>toutes les 6 heures</strong>, ce qui couvre aussi les postes laissés allumés en permanence, qui ne repassent jamais par un démarrage.</p>

<h4>Peut-on créditer deux fois par erreur ?</h4>
<p>Non. Chaque échéance ne peut être honorée qu'une seule fois, et cette garantie vaut pour tous les postes à la fois : si plusieurs personnes ouvrent l'application le même matin, un seul poste effectue le traitement. Un traitement partiellement réussi n'est jamais rejoué non plus, pour ne pas recréditer les salariés déjà traités.</p>

<h4>Vérifier ce qui a été traité</h4>
<p>Section <strong>Paramètres</strong> : chaque tuile (« Taux d'acquisition CP », « Basculement annuel CP », « Traitement annuel RTT ») affiche en bas la date du dernier traitement effectué et le nombre de salariés concernés. Une notification est également envoyée à chaque administrateur à chaque traitement, y compris lors d'un rattrapage.</p>

<h4>Un solde semble en retard par rapport au bulletin de paie</h4>
<ol>
  <li><strong>Vérifier la date</strong> : l'acquisition du mois en cours n'est créditée que le 1<sup>er</sup> du mois suivant. Un écart d'un mois en cours de mois est normal.</li>
  <li><strong>Vérifier l'historique des traitements</strong> dans les Paramètres : si un mois manque, ouvrir l'application suffit désormais à le rattraper.</li>
  <li><strong>Vérifier le statut « arrêt maladie »</strong> du salarié : un salarié en arrêt acquiert à taux réduit. Le passage en arrêt doit toujours se faire <strong>depuis la fiche salarié</strong>, jamais directement en base, sous peine de fausser le taux appliqué.</li>
  <li>Si l'écart persiste, voir la fiche <em>« Remettre les soldes à jour après une erreur de calcul »</em>.</li>
</ol>
`
    },

    {
        id: 'sync-outlook',
        titre: "Synchronisation calendrier Outlook",
        motsCles: ['outlook', 'calendrier', 'ics', 'sync', 'synchronisation', 'agenda', 'event', 'rendez-vous'],
        contenu: `
<h3>Synchronisation calendrier Outlook</h3>

<p>Depuis la v1.2, l'application peut envoyer automatiquement les absences dans le calendrier Outlook personnel de chaque utilisateur (admin et salariés). Le mécanisme utilise des fichiers <code>.ics</code> ouverts via Outlook (calendrier par défaut du compte Windows connecté). <strong>Aucune configuration par utilisateur n'est nécessaire</strong> : la sync est universelle.</p>

<h4>Quand l'event est-il créé ?</h4>
<ul>
  <li><strong>Un salarié pose une absence</strong> → Outlook s'ouvre immédiatement sur son poste avec l'event prêt à enregistrer. <em>Pas besoin d'attendre la validation admin.</em></li>
  <li><strong>L'admin pose son propre congé</strong> (section Mes Congés) → Outlook s'ouvre côté admin, comme un salarié.</li>
  <li><strong>L'admin valide la demande d'un autre salarié</strong> → <strong>rien</strong> côté admin. Seul le salarié concerné a l'event dans son calendrier (créé à la pose). Lilian ne voit donc plus tous les congés des autres dans son agenda perso.</li>
</ul>

<h4>Quand l'event est-il retiré ?</h4>
<ul>
  <li><strong>L'admin refuse une demande</strong> → toast côté salarié avec bouton <strong>« 📅 Retirer de mon calendrier »</strong>. Le salarié clique → Outlook s'ouvre avec un CANCEL qui retire l'event.</li>
  <li><strong>Le salarié annule sa demande en attente</strong> (corbeille « Mes demandes en cours ») → modale de confirmation avec une checkbox <strong>« Retirer également de mon calendrier Outlook »</strong> cochée par défaut. Le CANCEL est envoyé avant la suppression DB.</li>
  <li><strong>L'admin supprime une absence validée</strong> → la modale de suppression a une checkbox <strong>« Retirer également de mon calendrier Outlook »</strong> (visible si la sync admin est activée dans Paramètres). Si cochée, le CANCEL est envoyé côté admin. <em>Le salarié reçoit un toast « Absence supprimée » avec son propre bouton « Retirer de mon calendrier ».</em></li>
</ul>

<h4>Suppression d'un jour seul d'une période multi-jours</h4>
<p>Cas particulier : l'admin retire un jour d'une absence de plusieurs jours et coche « Retirer de mon calendrier Outlook ».</p>
<ol>
  <li>L'event original (la période complète) est <strong>annulé</strong> dans Outlook.</li>
  <li>Les 1 ou 2 sous-périodes restantes sont <strong>rouvertes</strong> automatiquement via de nouveaux events Outlook.</li>
</ol>
<p>Concrètement : Outlook ouvre plusieurs fenêtres successives — une pour le CANCEL, une pour chaque sous-absence à ré-ouvrir. L'admin enregistre chacune.</p>

<h4>Réglage côté admin (Paramètres → Synchronisation calendrier Outlook)</h4>
<ul>
  <li><strong>Case activée</strong> (défaut) : la pose admin pour soi-même + la checkbox « Retirer du calendrier » de la modale suppression sont disponibles.</li>
  <li><strong>Case décochée</strong> : aucune action admin ne déclenche d'event Outlook côté admin. Les salariés continuent normalement de recevoir leurs events à la pose.</li>
</ul>

<h4>Pré-requis côté poste</h4>
<ul>
  <li>Outlook desktop doit être <strong>installé et configuré</strong> comme application par défaut Windows pour les fichiers <code>.ics</code> (c'est le cas par défaut sur la plupart des configurations M365).</li>
  <li>Le compte Outlook connecté détermine dans quel calendrier l'event est créé : sur le poste de Lilian → son compte (ex. <code>pilotage@</code>), sur le poste d'un salarié → son compte perso.</li>
</ul>

<h4>⚠️ Important : garder Outlook ouvert pour une expérience fluide</h4>
<p>L'app Conges envoie le <code>.ics</code> via la commande standard Windows « ouvrir ce fichier avec son application par défaut ». Le comportement dépend ensuite de l'état d'Outlook :</p>
<ul>
  <li><strong>Outlook est déjà ouvert</strong> ✅ — L'event apparaît en quasi-temps réel, généralement avec une popup d'ajout au calendrier.</li>
  <li><strong>Outlook est fermé</strong> ⏳ — Windows démarre Outlook en background, ce qui peut prendre 5 à 30 secondes (surtout au premier lancement après ouverture de session, ou avec le « New Outlook » qui est plus lent au boot que le classique). L'event arrive au démarrage manuel ou automatique d'Outlook, sans notification visible.</li>
  <li><strong>« New Outlook »</strong> 🐌 — La nouvelle version d'Outlook ne vole jamais le focus. L'event arrive silencieusement dans le calendrier sans popup. Il faut l'ouvrir et regarder dans le calendrier pour le voir.</li>
</ul>
<p><strong>Recommandation pratique</strong> : garder Outlook ouvert en permanence sur les postes. Lilian et la plupart des salariés l'ouvrent déjà le matin de toute façon. Si l'event n'apparaît pas dans les 30 secondes après une action dans Conges, il suffit d'ouvrir Outlook manuellement — le fichier en file d'attente est traité à l'ouverture.</p>

<h4>Cas où l'event n'arrive pas dans le bon calendrier</h4>
<p>Outlook ajoute l'event au <strong>calendrier par défaut</strong> du compte connecté. Si le compte a plusieurs calendriers (perso + boîte partagée), il faut soit :</p>
<ul>
  <li>Configurer Outlook pour que le bon calendrier soit le calendrier par défaut (clic droit sur le calendrier → <em>Définir comme dossier de calendrier par défaut</em>).</li>
  <li>Ou au moment où Outlook propose la fenêtre d'ajout, choisir manuellement le calendrier de destination dans le menu déroulant.</li>
</ul>

<h4>Cas où rien ne se passe</h4>
<p>Si après une action (pose, suppression, refus...) aucun event Outlook n'apparaît et qu'Outlook a été ouvert, vérifier :</p>
<ol>
  <li>Que la case <strong>« Synchronisation calendrier Outlook »</strong> est cochée dans <em>Paramètres</em> (côté admin).</li>
  <li>Que le fichier <code>.ics</code> a bien été généré : tape <code>%TEMP%</code> dans la barre d'adresse de l'Explorateur, et cherche <code>conges-lce-absence-X-publish.ics</code> (le X est l'ID de l'absence). Si présent → le problème est entre le fichier et Outlook (association Windows, Outlook fermé...). Si absent → problème côté Conges, contacter le support.</li>
  <li>Double-cliquer le fichier <code>.ics</code> manuellement pour forcer l'ouverture. Si Outlook ne réagit pas, vérifier dans <em>Paramètres Windows → Applications par défaut</em> que <code>.ics</code> est bien associé à Outlook.</li>
</ol>

<p class="aide-tip"><i class="fa-solid fa-circle-info"></i> <strong>Note :</strong> Si un salarié pose puis voit sa demande refusée, l'event reste momentanément dans son Outlook jusqu'à ce qu'il clique sur « Retirer de mon calendrier » dans le toast de refus. Le toast reste affiché tant que le bouton n'a pas été cliqué (pas d'auto-dismiss).</p>
`
    }
];
