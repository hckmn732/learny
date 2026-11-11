# ADR-0048 — Tests de l'IA et recherche web de repli

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-504, SPEC-512

## Contexte

Tests déterministes et sans coût ; fournisseurs sans recherche intégrée.

## Décision

`LLM_MODE=mock` en test : `MockLanguageModel` alimenté par des fixtures JSON versionnées par tâche et scénario ; les tests vérifient la validation, l'exécution des actions et les cas d'erreur (brique invalide, refus, plafond). Tests réels optionnels (`LLM_LIVE_TESTS=1`). Recherche web de repli : API Tavily (`SEARCH_API_KEY`).

## Conséquences

Toute nouvelle consigne exige ses fixtures.
