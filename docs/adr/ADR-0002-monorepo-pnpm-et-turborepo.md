# ADR-0002 — Monorepo pnpm et Turborepo

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-001

## Contexte

Web, worker et paquets métier partagent types et schémas.

## Décision

Monorepo `pnpm` workspaces (`apps/*`, `packages/*`) orchestré par Turborepo (`turbo.json` : tâches `build`, `lint`, `typecheck`, `test:unit`, `test:int`, `test:e2e` avec cache). Paquets nommés `@learny/<nom>`.

## Conséquences

Frontières de dépendances imposées par ESLint (docs/architecture/overview.md §3).
