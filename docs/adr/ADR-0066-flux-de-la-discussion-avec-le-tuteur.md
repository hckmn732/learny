# ADR-0066 — Flux de la discussion avec le tuteur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-610

## Contexte

Réponses progressives.

## Décision

Réponses diffusées en SSE avec le protocole de flux de l'AI SDK (`streamText` → `toUIMessageStreamResponse`) ; côté client, hook dédié qui gère contexte, sources et suites.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
