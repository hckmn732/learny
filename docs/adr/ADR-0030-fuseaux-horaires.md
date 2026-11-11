# ADR-0030 — Fuseaux horaires

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-207

## Contexte

Notifications et planification locales.

## Décision

Stockage UTC ; fuseau IANA par utilisateur (défaut détecté par le navigateur à l'inscription, sinon Europe/Paris) ; utilitaires `packages/core/src/time.ts` basés sur `Intl` et `@date-fns/tz`.

## Conséquences

Les crons sont horaires et sélectionnent les utilisateurs selon leur heure locale.
