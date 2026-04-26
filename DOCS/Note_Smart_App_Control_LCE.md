# Note technique — Désactivation du Contrôle intelligent des applications

**Destinataire** : responsable IT / utilisateur référent — La Ciotat Entreprendre
**Émetteur** : Excellium
**Application concernée** : Gestion des Congés (Conges-LCE)
**Date** : 26/04/2026

---

## Résumé

L'application **Gestion des Congés** peut être bloquée au lancement par une fonctionnalité récente de Windows 11 nommée **Contrôle intelligent des applications** (*Smart App Control*). Le message affiché est :

> *« Le Contrôle intelligent des applications a bloqué une application potentiellement dangereuse. »*

Cette alerte n'indique **pas** que l'application est malveillante. Elle signifie uniquement que Microsoft ne reconnaît pas encore le fichier, car il est diffusé en interne et non distribué via le Microsoft Store.

Pour permettre l'utilisation de l'application sur chaque poste, il est nécessaire de **désactiver le Contrôle intelligent des applications**.

---

## Pourquoi ce blocage apparaît

Microsoft a introduit le Contrôle intelligent des applications dans Windows 11 pour bloquer les exécutables qui n'ont pas encore acquis une « réputation » suffisante auprès du service cloud Microsoft Defender. Concrètement, un logiciel récent ou peu diffusé est considéré comme suspect par défaut, même s'il est parfaitement légitime.

L'application Gestion des Congés est :
- Développée spécifiquement pour La Ciotat Entreprendre par Excellium
- Distribuée hors Microsoft Store (clé USB / mise à jour interne)
- Mise à jour régulièrement, ce qui réinitialise à chaque version sa réputation auprès de Microsoft

C'est cette combinaison qui déclenche le blocage.

---

## Procédure de désactivation

À effectuer **une seule fois par poste**, par un utilisateur disposant des droits administrateur Windows.

1. Ouvrir **Paramètres** Windows (touche Windows + I)
2. Aller dans **Confidentialité et sécurité**
3. Cliquer sur **Sécurité Windows**
4. Cliquer sur **Contrôle des applications et du navigateur**
5. Cliquer sur **Paramètres du contrôle intelligent des applications**
6. Sélectionner **Désactivé**
7. Confirmer le redémarrage si demandé

Après l'opération, l'application Gestion des Congés se lance normalement.


---

## Important — caractère définitif

> **Une fois désactivé, le Contrôle intelligent des applications ne peut pas être réactivé sans réinstaller Windows entièrement.** Ce comportement est imposé par Microsoft.

Cette contrainte n'est pas problématique pour des postes professionnels à usage maîtrisé (logiciels métier identifiés, pas de téléchargement aléatoire), mais doit être connue et acceptée avant l'opération.

Les autres protections Windows restent actives :
- Microsoft Defender Antivirus continue de scanner tous les fichiers
- SmartScreen classique continue de filtrer les téléchargements
- Le pare-feu Windows reste opérationnel
- Le contrôle des comptes utilisateurs (UAC) fonctionne normalement

Le poste reste donc protégé contre les menaces réelles.

---

## Alternative — signature numérique de l'application

Pour éviter cette manipulation, Excellium peut faire signer numériquement les futures versions de l'application avec un certificat de signature de code émis par une autorité reconnue (DigiCert, Sectigo, GlobalSign…).

| Type de certificat | Coût annuel indicatif | Effet |
|---|---|---|
| OV (Organization Validation) | 100 à 300 € | Réputation à construire progressivement |
| EV (Extended Validation) | 300 à 500 € | Reconnaissance immédiate par Windows |

Cette solution supprime le blocage sans avoir à désactiver le Contrôle intelligent des applications. Le coût récurrent reste cependant conséquent au regard d'un déploiement à 3 postes.

---

## Recommandation Excellium

Pour un déploiement de 3 postes en usage interne maîtrisé, **désactiver le Contrôle intelligent des applications sur chaque poste est l'option la plus pragmatique** : zéro coût récurrent, manipulation rapide (5 minutes par poste), pas de baisse de protection significative.

La mise en place d'une signature numérique pourra être envisagée ultérieurement si l'application est déployée plus largement ou si la politique de sécurité évolue.

---

*Pour toute question, contacter Excellium.*
