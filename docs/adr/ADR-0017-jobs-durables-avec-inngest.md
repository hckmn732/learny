# ADR-0017 — Jobs durables avec Inngest

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-007, SPEC-203

## Contexte

Ingestion et génération longues, reprenables.

## Décision

Inngest. Fonctions et événements dans `packages/jobs`, servies par `apps/web` à `/api/inngest` (Vercel) ; `apps/worker` (Hono) sert les mêmes fonctions pour l'auto-hébergement. Étapes `step.run` idempotentes, 3 reprises avec backoff, crons horaires et nocturnes (docs/architecture/overview.md §5).

## Conséquences

En local : Inngest Dev Server.
