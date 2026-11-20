# ADR-0017 — Jobs durables avec Inngest

- **Statut** : Acceptée — amendée par ADR-1002
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-007, SPEC-203

> Amendée par ADR-1002 : à partir de SPEC-1101, les fonctions Inngest sont servies par `apps/api` à `/api/inngest` dans tous les environnements ; `apps/worker` est absorbé par `apps/api` (SPEC-1103).

## Contexte

Ingestion et génération longues, reprenables.

## Décision

Inngest. Fonctions et événements dans `packages/jobs`, servies par `apps/web` à `/api/inngest` pendant la transition (Vercel) et par `apps/api` dans les déploiements Docker et Vercel autonomes (rôle `all` ou `jobs`). Étapes `step.run` idempotentes, 3 reprises avec backoff, crons horaires et nocturnes (docs/architecture/overview.md §5).

## Conséquences

En local : Inngest Dev Server.
