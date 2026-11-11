# ADR-0068 — Source de vérité du suivi

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-003

## Contexte

Suivi centralisé.

## Décision

`progress/state.json` (écrit uniquement par `tools/sdd/*.mjs`) ; `progress/PROGRESS.md` est généré ; `progress/anomalies.md` et `progress/blockers.md` recensent anomalies et blocages externes.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
