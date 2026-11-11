# ADR-0070 — Outils de test

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-004

## Contexte

Pile de test.

## Décision

Vitest (unitaire, intégration, couverture v8), Testing Library, fast-check, Playwright (e2e, vidéo), `@axe-core/playwright`, `pixelmatch` + `pngjs` pour les comparaisons, MSW pour simuler les API externes HTTP.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
