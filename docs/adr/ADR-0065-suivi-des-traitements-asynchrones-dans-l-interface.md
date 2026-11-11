# ADR-0065 — Suivi des traitements asynchrones dans l'interface

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-607, SPEC-608

## Contexte

Statut des apports et des générations.

## Décision

Interrogation périodique (TanStack Query, intervalle 3 s tant que le statut est `queued|processing|generating|running`), pas de temps réel WebSocket en V1.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
