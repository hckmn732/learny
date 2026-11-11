# ADR-0162 — Sigle et couleur d'une formation

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-603 et SPEC-604)
- **Date** : 2026-11-11
- **Liens** : SPEC-603, SPEC-604, SPEC-304

## Contexte

Les cartes de formation de l'accueil, du menu et des maquettes portent un sigle et une couleur stable, absents du modèle initial. Leur calcul purement visuel côté client changerait entre écrans et rendrait le jeu de démonstration non reproductible.

## Décision

`formations` porte `monogram` (au plus 3 caractères) et `accent_color` de l'énumération `indigo`, `green`, `orange`, `violet`, `teal`, avec défaut `indigo`. Le repli du sigle prend les deux premiers caractères alphanumériques du titre, sans accents et en majuscules. La création choisit la première couleur de la palette non utilisée par les formations actives, en pause, en cadrage ou au programme proposé du même utilisateur ; si toutes sont prises, `indigo`. La palette et ses valeurs exactes sont celles de SPEC-603 §6 ; la même fonction `formationMonogram` et les mêmes jetons servent sur tous les écrans. Le seed de démonstration fixe SAP/indigo, AG/green, PY/orange, XL/teal et EN/violet.

## Conséquences

La migration est créée une seule fois, que SPEC-603 ou SPEC-604 soit exécutée en premier. Les tests vérifient les deux ordres et la cohérence entre accueil, menu et cadrage.
