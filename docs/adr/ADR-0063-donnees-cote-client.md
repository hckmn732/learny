# ADR-0063 — Données côté client

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-201

## Contexte

Cohérence du code client.

## Décision

TanStack Query v5 dans les composants clients (clés `['<domaine>', id]`, invalidation après mutation) ; état d'URL via les paramètres de recherche ; aucun gestionnaire d'état global.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
