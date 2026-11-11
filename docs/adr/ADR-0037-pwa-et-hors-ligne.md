# ADR-0037 — PWA et hors ligne

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-801

## Contexte

Réviser sans réseau.

## Décision

Manifest + service worker (Serwist). Hors ligne : session de quiz global du jour et cartes de rappel (préchargées chaque jour dans IndexedDB via `idb`), file d'attente des réponses rejouée au retour du réseau (`/api/v1/sync/offline-answers`, idempotente par identifiant client). Le serveur fait foi et recalcule FSRS.

## Conséquences

Les autres écrans affichent la page `/hors-ligne`.
