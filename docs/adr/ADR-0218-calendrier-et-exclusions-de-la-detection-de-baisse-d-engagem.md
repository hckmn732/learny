# ADR-0218 — Calendrier et exclusions de la detection de baisse d'engagement V2

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-907

## Contexte

ADR-0212 fixe signaux, seuils et frequence de la proposition, mais ni l'heure d'evaluation, ni la date de fin de pause proposee, ni le traitement des activites minutees ; ADR-0190 limite l'enumeration automation_key a dix cles.

## Décision

La detection est evaluee une fois par jour au tick horaire de 20 h locale (fuseau du profil). La proposition de pause preremplit une fin de pause a J+3 jours locaux, modifiable par l'apprenant dans le dialogue de pause de SPEC-721. Les reponses d'examen blanc (minute) sont exclues du signal de reponses trop rapides mais comptent pour la baisse de justesse. Les seances sans duree prevue ne comptent pas pour le signal de seances ecourtees. L'automatisme utilise une onzieme cle automation_key = engagement, ajoutee par migration additive selon le point 5 d'ADR-0190.

## Conséquences

Migration additive de l'enumeration automation_key ; SPEC-710 affiche la nouvelle cle seulement a partir de la V2.
