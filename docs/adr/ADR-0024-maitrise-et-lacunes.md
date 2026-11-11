# ADR-0024 — Maîtrise et lacunes

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-403, SPEC-404

## Contexte

La spécification legacy décrit les règles qualitativement ; il faut des formules.

## Décision

Maîtrise = Σ(wᵢ·réussiteᵢ)/Σwᵢ, wᵢ = 0,5^(âgeᵢ/14 j), réussite ∈ [0,1] (score partiel pour les réponses notées). Seuil 80 %. Nature et priorité selon BR-LAC-03. Levée selon BR-LAC-06. Même erreur = même distracteur ou même réponse normalisée (minuscules, sans accents ni espaces superflus).

## Conséquences

Paramètres exposés dans `packages/config/src/product.ts`.
