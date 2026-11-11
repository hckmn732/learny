# ADR-0021 — Le modèle propose, le code valide

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-508

## Contexte

Fiabilité des contenus générés.

## Décision

Le tuteur agit uniquement via un registre fermé d'actions (docs/architecture/ai.md §3), chacune validée par schéma et garde-fou avant exécution transactionnelle. Brique invalide renvoyée au modèle au plus 2 fois.

## Conséquences

Ajouter une capacité au tuteur = ajouter une action.
