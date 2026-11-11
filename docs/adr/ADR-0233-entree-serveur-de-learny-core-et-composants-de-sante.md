# ADR-0233 — Entrée serveur de @learny/core et composants de santé

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-010

## Contexte

SPEC-010 ajoute pino et AsyncLocalStorage à packages/core ; la racine du paquet est déjà importée par des composants clients (horloge, erreurs). La santé de SPEC-006 doit gagner des composants sans perdre ses champs.

## Décision

Les modules serveur (logger, contexte de requête, redaction serveur) sont exportés par @learny/core/server ; la racine ne garde que des exports sûrs pour le navigateur (redaction, projection Sentry) et des types. La santé conserve status/version/commit/database et ajoute components { database, build } avec les états ok|unavailable|not_configured. Le SDK Sentry est chargé dynamiquement seulement si le DSN est défini hors test.

## Conséquences

Aucun bundle client ne contient pino ni node:async_hooks. Les routes et services serveur importent @learny/core/server. Les tests de non-régression SPEC-006 comparent les champs ajoutés au contrat.
