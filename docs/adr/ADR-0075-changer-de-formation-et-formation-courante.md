# ADR-0075 — Changer de formation et formation courante

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-304, SPEC-618

## Contexte

Menu « Formation en cours ».

## Décision

`profiles.current_formation_id` est mis à jour à chaque ouverture d'une page d'une formation active ou en pause ; si null, la première formation active par `last_opened_at` ; si aucune, la section « Formation en cours » propose « Créer une formation ».

## Conséquences

Aucune conséquence particulière au-delà de la décision.
