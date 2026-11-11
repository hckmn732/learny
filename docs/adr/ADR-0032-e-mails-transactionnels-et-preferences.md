# ADR-0032 — E-mails transactionnels et préférences

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-204

## Contexte

Conformité et lisibilité.

## Décision

Connexion, confirmation, sécurité, export, suppression : toujours envoyés. Tous les autres e-mails contiennent un lien « Gérer mes notifications » vers `/parametres#notifications` et un en-tête `List-Unsubscribe`.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
