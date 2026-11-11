# ADR-0019 — Couche multi-fournisseurs et fonctions Anthropic

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-504, SPEC-507

## Contexte

BYOK et coût.

## Décision

AI SDK (Vercel) pour tous les fournisseurs. Avec Anthropic : outils stricts, sorties structurées, citations, API Files pour les PDF, recherche web serveur, mise en cache du contexte stable, API Batches pour les générations différées, réflexion adaptative avec effort par tâche. Ces fonctions sont encapsulées dans `packages/llm` avec des substituts pour les autres fournisseurs (docs/architecture/ai.md).

## Conséquences

Aucun paquet hors `llm` n'importe un SDK de fournisseur.
