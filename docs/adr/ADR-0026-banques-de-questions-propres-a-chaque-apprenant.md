# ADR-0026 — Banques de questions propres à chaque apprenant

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-513

## Contexte

La legacy prévoyait des banques partagées entre apprenants d'un même programme, ce qui contredit la confidentialité des cours (BR-GRP-03).

## Décision

Les banques sont générées à partir du cours privé de chaque apprenant et ne sont jamais partagées. 4 variantes minimum par notion et par format pertinent ; génération en lot (API Batches) la nuit ; régénération quand toutes les variantes ont été vues.

## Conséquences

Coût IA un peu plus élevé, confidentialité garantie.
