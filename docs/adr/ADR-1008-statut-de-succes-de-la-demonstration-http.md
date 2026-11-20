# ADR-1008 — Statut de succès de la démonstration HTTP

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-18
- **Liens** : SPEC-1003, ADR-1001, ADR-1002

## Contexte

SPEC-1003 §10-11 demande 200 pour dev.echo, tandis que le contrat existant packages/contracts/src/dev.ts fixe successStatus à 201 et que ADR-1001 interdit tout changement fonctionnel pendant la migration.

## Décision

La démonstration SPEC-1003 exécute le contrat dev.echo existant et affiche le statut 201. Les cas invalide et sans clé restent 400. CA-5 est évalué sur 201/400/400 sans modifier le contrat ni une assertion antérieure.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
