# ADR-0034 — Échelle d'affichage et conformité visuelle

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-005, SPEC-301

## Contexte

Les maquettes sont affichées à 90 % (zoom CSS du moteur de maquettes) ; il faut une méthode de vérification visuelle automatisable.

## Décision

Les jetons de design reprennent les valeurs des maquettes converties en rem (px/16) et la racine est `html { font-size: 90% }` : l'application a ainsi l'échelle validée sans `zoom` CSS et respecte les préférences de taille du navigateur. Vérification : contrôle des jetons, de la structure, comparaison côte à côte avec la référence générée depuis la maquette (écart ≤ 12 % de pixels) et non-régression `toHaveScreenshot` (docs/engineering/testing.md §6).

## Conséquences

Les maquettes `design/maquettes/` ne sont jamais modifiées.
