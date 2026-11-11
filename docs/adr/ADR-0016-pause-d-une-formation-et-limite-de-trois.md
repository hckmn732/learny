# ADR-0016 — Pause d'une formation et limite de trois

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-618, SPEC-721

## Contexte

Trois formations actives au plus.

## Décision

Mettre en pause une formation annule ses créneaux futurs (statut `cancelled`) et suspend ses automatismes ; la reprendre relance le planificateur depuis la date de reprise. La pause globale (automatisme 10) est distincte : elle gèle toutes les formations.

## Conséquences

Le compteur de formations actives inclut les formations à plusieurs.
