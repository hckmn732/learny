# ADR-0161 — Comparaison visuelle par régions des écrans partiels

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-601 à SPEC-604)
- **Date** : 2026-11-11
- **Liens** : SPEC-601, SPEC-602, SPEC-603, SPEC-604, SPEC-722

## Contexte

Plusieurs spécifications construisent successivement le même écran maquetté. Une comparaison pleine page prématurée mesurerait surtout les régions que la spécification courante n'a pas encore pour mission de livrer. Une règle métier peut aussi imposer un état de bouton différent de celui visible dans la maquette.

## Décision

Chaque spécification compare à la maquette les régions qu'elle possède, avec les mêmes données, heure, viewport et état ; `compareRegions` découpe application et référence selon des sélecteurs/rectangles consignés dans le test. Le seuil de 12 % de `docs/engineering/testing.md` §6 s'applique à chaque région, sans masquer une région non conforme par une grande zone vide. La dernière spécification qui termine l'écran ajoute une comparaison pleine page ; pour SCR-03, il s'agit de SPEC-722. Les écarts imposés par une règle métier supérieure à la maquette sont documentés dans le test et restent visibles dans le diff, sans relever le seuil. Les captures de non-régression `toHaveScreenshot` restent obligatoires dès la première livraison de la région.

## Conséquences

Le manifeste visuel nomme le propriétaire et l'état de chaque région. Les tests ultérieurs rejouent les régions livrées et la comparaison pleine page lorsqu'elle existe.
