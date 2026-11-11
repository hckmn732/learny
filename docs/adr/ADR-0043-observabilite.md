# ADR-0043 — Observabilité

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-010

## Contexte

Diagnostic en production.

## Décision

Logger pino structuré (JSON) avec `requestId` ; Sentry (web, worker, jobs) activé si `SENTRY_DSN` ; journal des appels IA en base ; endpoint `/api/v1/health` (base, version, commit).

## Conséquences

Aucune conséquence particulière au-delà de la décision.
