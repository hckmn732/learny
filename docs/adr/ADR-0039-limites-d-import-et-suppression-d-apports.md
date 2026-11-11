# ADR-0039 — Limites d'import et suppression d'apports

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-206, SPEC-607

## Contexte

Bornes non définies dans la legacy.

## Décision

Limites de BR-APP-02. Suppression d'un apport : suppression du fichier et des passages ; les citations qui y pointaient sont conservées avec `chunk_id = null` et affichées « source supprimée ».

## Conséquences

Aucune conséquence particulière au-delà de la décision.
