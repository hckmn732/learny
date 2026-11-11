# ADR-0069 — Checkpoints et reprise automatique

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-003

## Contexte

Validation par phase et robustesse de la boucle.

## Décision

Un checkpoint par phase (`specs/checkpoints.md`). Reprise : une spécification `in_progress` est reprise au redémarrage ; 5 tentatives de validation au plus, puis statut `blocked` avec rapport d'anomalie et poursuite des spécifications indépendantes ; les spécifications dépendantes passent en `waiting`.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
