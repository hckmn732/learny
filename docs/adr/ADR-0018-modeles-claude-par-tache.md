# ADR-0018 — Modèles Claude par tâche

- **Statut** : Remplacée par ADR-0340
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-504

> Remplacée par ADR-0340 : la plateforme ne fournit aucun modèle, donc aucun modèle par défaut par tâche. Le texte ci-dessous est conservé pour l’historique.

## Contexte

Coût et qualité.

## Décision

IA fournie : `claude-opus-5-5` (programme, cours, lacunes), `claude-sonnet-5-5` (tuteur, questions, correction), `claude-haiku-5-5` (léger). Identifiants dans `packages/config/src/models.ts`.

## Conséquences

Changer de modèle = modifier la configuration, pas le code.
