# ADR-0073 — Tarifs de l'IA en configuration

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-507

## Contexte

Les tarifs évoluent.

## Décision

`packages/config/src/pricing.ts` contient les tarifs par million de tokens (Opus 5.5 : 4/20 ; Sonnet 5.5 : 2/10 ; Haiku 5.5 : 0,10/0,50 ; lecture cache = 5 % de l'entrée ; lots = −50 %) ; à revérifier avant la mise en production (checklist SPEC-808).

## Conséquences

Aucune conséquence particulière au-delà de la décision.
