# ADR-3022 — Conformité visuelle de Réviser : ligne de base versionnée de la session

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-3305, SPEC-3301, ADR-3003, ADR-3019, ADR-3021

## Contexte

SPEC-3305 déclare un mode visuel `mockup` et un critère CA-5 « session et échauffement conformes à la
maquette corrigée (écart ≤ 12 %) » contre `design/app-mobile/exports/screens/{ios,android}-06-session.png`.
Trois éléments rendent la superposition à cet export structurellement inexacte, sans qu'aucun ne soit
un écart de rendu :

1. ADR-3003 § 2 corrige la maquette : la zone des boutons « À revoir / Je savais » appartient à
   l'échauffement ; la session affiche les quatre auto-évaluations « Raté / Difficile / Bon / Facile »
   avec leurs échéances, soit quatre boutons au lieu de deux et une ligne de plus ;
2. le rail des jeux est ajouté au-dessus de la zone de jeu (EF-2), absent de l'export ;
3. la session du jour vient des données de démonstration : cinq jeux (carte, association, remise en
   ordre, classement, texte à trous) et un encadré du tuteur à 15 minutes, alors que l'export fige
   « Notion 4 sur 14 » et « 4 min ».

La capture `Android` du flux `@visual` est prise avant toute mutation, sur l'état initial de la
session (carte de rappel en tête) : elle est donc reproductible d'une campagne à l'autre.

## Décision

La conformité visuelle de l'onglet Réviser est prouvée par la comparaison versionnée d'ADR-3003 § 4
(capture `takeScreenshot` du flux `@visual` contre `apps/mobile/e2e/visual/baselines/`), complétée
par les contrôles structurels de la maquette corrigée (`review-progress`, `review-rail`, `review-card`,
`review-grade-*`, `review-streak`, `review-tutor-note`) et par les tests de rendu Jest. Le masque du
flux ne couvre que la barre d'onglets native (ADR-3003 § 3) ; la barre d'état est masquée par les
zones natives par défaut. Aucune zone de contenu n'est masquée.

La superposition à l'export statique est mesurée et consignée dans `evidence/SPEC-3305/acceptance.md`,
jamais présentée comme conforme : les trois écarts ci-dessus (boutons de l'échauffement, rail ajouté,
données de démonstration) sont des écarts structurels assumés.

## Conséquences

- Une régression de rendu de la session est détectée par la ligne de base versionnée.
- L'écart à l'export statique reste documenté et devra être re-mesuré si la maquette est un jour
  ré-exportée avec les corrections d'ADR-3003 § 2.
- L'échauffement n'a pas d'export dédié : sa conformité est prouvée par les jetons, l'ordre des
  régions et les `testID` (`warmup-question`, `warmup-reveal`, `warmup-knew`, `warmup-again`).
