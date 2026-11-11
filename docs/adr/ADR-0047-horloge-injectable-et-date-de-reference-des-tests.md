# ADR-0047 — Horloge injectable et date de référence des tests

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-004, SPEC-207

## Contexte

Les maquettes montrent le mercredi 11 novembre 2026 à 13:20 ; les tests doivent être reproductibles.

## Décision

`packages/core/src/clock.ts` expose `clock.now()` ; le serveur lit `CLOCK_FIXED_AT` (tests, démonstration) ; le navigateur est figé par `page.clock`. Date de référence : 2026-11-11T12:20:00Z.

## Conséquences

Usage direct de `Date.now()` interdit par ESLint.
