# ADR-0033 — Comptage de la série

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-409

## Contexte

La legacy ne définit pas précisément un jour de série.

## Décision

Règle BR-GAM-01. Calcul : parcours des jours en arrière dans le fuseau de l'utilisateur ; un jour non prévu dans le rythme ou couvert par une pause est neutre ; un jour prévu sans activité qualifiante casse la série.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
