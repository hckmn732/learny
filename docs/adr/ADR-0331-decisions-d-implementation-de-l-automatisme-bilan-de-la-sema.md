# ADR-0331 — Décisions d'implémentation de l'automatisme bilan de la semaine

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-16
- **Liens** : SPEC-720, SPEC-711, SPEC-408, SPEC-402, SPEC-407, ADR-0190, ADR-0047

## Contexte

SPEC-720 s'appuie sur le moteur de SPEC-711, la rétention de SPEC-408, les lacunes de SPEC-402 et les créneaux de SPEC-407. Le texte fixe la clé bilan, le kind weekly_review et une clé de déduplication sur la semaine locale, mais laisse ouverts le bornage exact de la semaine, la règle des notions à risque, la restriction du canal e-mail et la provenance des valeurs de démonstration.

## Décision

La semaine locale va du lundi au jour local du déclenchement (dimanche par défaut) ; la clé de déduplication combine l'utilisateur et l'année-semaine ISO du lundi. Les notions à risque sont celles de maîtrise strictement inférieure à 60 qui sont dues à l'instant du bilan ou portent une lacune ouverte ; l'ordre est maîtrise croissante puis libellé puis identifiant. Le canal app crée seulement la notification interne ; app_email autorise uniquement la livraison e-mail, via un filtre facultatif externalChannels de notify (préférences, heures calmes et plafond restant ceux de SPEC-209). Le payload du bilan de démonstration SPEC-115 porte les chiffres réels de sa semaine (13 h, 86 %, 3 notions) afin que la référence SCR-03 reste comparable ; la génération réelle les recalcule toujours.

## Conséquences

Le bilan ne duplique jamais une semaine locale, y compris lors d'un changement d'heure. Une mesure absente reste null et s'affiche « Non disponible ». Les autres producteurs de notifications conservent le comportement par défaut tant qu'ils n'utilisent pas externalChannels.
