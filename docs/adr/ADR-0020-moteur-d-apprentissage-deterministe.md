# ADR-0020 — Moteur d'apprentissage déterministe

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-401 à SPEC-411

## Contexte

Dates, scores et déblocages doivent être exacts et testables.

## Décision

`packages/learning-engine` : TypeScript pur, aucune I/O, aucun appel IA ; entrées et sorties sérialisables ; horloge injectée. Persistance par `packages/services`.

## Conséquences

Tests unitaires et par propriétés (fast-check).
