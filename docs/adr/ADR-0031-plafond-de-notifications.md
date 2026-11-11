# ADR-0031 — Plafond de notifications

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-209

## Contexte

Éviter la sur-sollicitation.

## Décision

Le plafond quotidien (3/5/8, défaut 5) s'applique aux envois e-mail et navigateur, toutes sources confondues. Les notifications in-app ne sont pas plafonnées. Les envois écartés sont résumés dans le programme du jour suivant.

## Conséquences

Les e-mails transactionnels ne comptent pas (ADR-0032).
