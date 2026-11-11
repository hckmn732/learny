# ADR-0001 — Développement piloté par les spécifications (SDD)

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : AGENTS.md, SPEC-003

## Contexte

Le produit doit être livré par des agents IA sans intervention humaine. Il faut un référentiel exécutable et traçable.

## Décision

Le dépôt contient : `docs/` (produit, architecture, ingénierie, ADR), `specs/` (catalogue JSON + une spécification Markdown par unité de travail, gabarit unique), `tools/sdd/` (boucle, validation, suivi, audit), `progress/` (état), `evidence/` (preuves). Le processus est décrit dans `docs/engineering/sdd-process.md` et `AGENTS.md`. Les ADR priment sur tout autre document en cas de conflit.

## Conséquences

Toute ambiguïté rencontrée pendant l'implémentation se résout par un nouvel ADR (statut « Déduite »), jamais en sollicitant l'utilisateur.
