# ADR-0003 — Versions du socle technique

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-001

## Contexte

Les agents doivent installer des versions cohérentes sans demander.

## Décision

Node.js 24 LTS, pnpm 10, TypeScript ≥ 5.9 strict. Pour chaque dépendance : dernière version stable au moment de l'installation, figée par le lockfile, avec les majeures minimales listées dans `docs/engineering/conventions.md` §1. Si une version minimale est incompatible avec une autre dépendance, l'agent choisit la combinaison stable la plus récente qui compile et passe les tests, et l'ajoute en addendum à cet ADR.

## Conséquences

Reproductibilité par le lockfile ; mises à jour majeures uniquement via une spécification.
