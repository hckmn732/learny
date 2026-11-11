# ADR-0146 — Mesure de la rétention et des indicateurs

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-408, SPEC-603, SPEC-617, SPEC-720

## Contexte

BR-MEM-06 définit la rétention à 30 et 60 jours (± 3) sans préciser quelle revue compter ni comment arrondir ; les indicateurs de progression doivent avoir une définition unique.

## Décision

1. Pour chaque notion d'un module validé, on retient la **première** revue de source `global_quiz`, `micro_session` ou `offline` dont l'écart en jours locaux avec la date locale de validation du module appartient à [h − 3, h + 3] ; elle est réussie si `correct`.
2. Taux = réussites / notions mesurées, arrondi à l'entier le plus proche (demi vers le haut) ; `null` (affiché « — ») si aucune notion n'est mesurée. L'agrégation multi-formations additionne numérateurs et dénominateurs.
3. Avancement = arrondi(100 × modules validés / modules) (BR-PRO-01). Heures prévues et faites : créneaux hors marges, hors statuts `cancelled` et `moved` ; marges restantes : marges au statut `planned`.

## Conséquences

Les valeurs de la maquette d'accueil (38 % pour 2 modules validés sur 7) ne sont pas reproduites par le calcul : BR-PRO-01 prime.
