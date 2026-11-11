# ADR-0067 — Crons par fuseau

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-203

## Contexte

Envois à l'heure locale.

## Décision

Cron horaire (minute 5) qui sélectionne les utilisateurs dont l'heure locale correspond à l'heure configurée (programme du jour, micro-séance, bilan) ; cron nocturne 01:30 UTC pour les traitements globaux.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
