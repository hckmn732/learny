# ADR-0025 — FSRS par notion

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-402

## Contexte

Répétition espacée.

## Décision

Bibliothèque `ts-fsrs`, paramètres par défaut, `request_retention` = taux visé (0,90 par défaut). Une carte FSRS par (utilisateur, notion). Note déduite de la justesse et du temps (BR-MEM-02) ; temps médian par apprenant et par format calculé sur ses 50 dernières réponses (défaut 20 s si moins de 5 réponses).

## Conséquences

Le recalibrage des paramètres FSRS est hors V1.
