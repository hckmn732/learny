# ADR-0018 — Modèles Claude par tâche

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-504

## Contexte

Coût et qualité.

## Décision

IA fournie : `claude-opus-5-5` (programme, cours, lacunes), `claude-sonnet-5-5` (tuteur, questions, correction), `claude-haiku-5-5` (léger). Identifiants dans `packages/config/src/models.ts`.

## Conséquences

Changer de modèle = modifier la configuration, pas le code.
