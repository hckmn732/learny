# ADR-0058 — Stockage des fichiers

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-114, SPEC-206

## Contexte

Buckets et accès.

## Décision

Buckets privés `resources` et `exports` ; chemin `<userId>/<uuid>/<nom>` ; envoi par URL signée (10 min) puis finalisation ; lecture par URL signée de 10 min.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
