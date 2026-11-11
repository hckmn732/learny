# ADR-0143 — Tirage d'une tentative : quotas et couverture

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-405, SPEC-611

## Contexte

ADR-0014 fixe la taille (12, de 10 à 20, une question par notion au minimum) et la répartition (≈ 70 % choix, au moins une ouverte) ; il manque une méthode exacte de surpondération et le traitement d'un module de plus de 20 notions, où la couverture complète est impossible.

## Décision

1. Taille = min(20, max(12, nombre de notions du module)).
2. Quota de base de 1 par notion ; les questions supplémentaires sont réparties par la méthode du plus fort reste avec les poids : lacune 3, maîtrise < seuil 2, autre 1 ; égalités départagées par l'ordre de priorité (nature de lacune, maîtrise croissante, position).
3. Nombre de questions ouvertes = max(1, arrondi(taille × 0,3)) ; elles sont attribuées aux notions dans l'ordre de priorité, une par notion, puis en boucle.
4. Une question compte pour toutes les notions de ses `notionIds`. Au-delà de 20 notions, la tentative couvre en priorité les lacunes, puis les maîtrises les plus faibles, puis l'ordre du programme ; les notions non couvertes sont renvoyées dans `uncoveredNotionIds` et deviennent prioritaires à la tentative suivante.
5. Sélection pseudo-aléatoire déterministe avec la graine `attemptId` ; ordre : questions à choix puis ouvertes, chaque bloc entrelacé par notion.
6. Points : 100 / taille arrondis au centième, le dernier élément absorbant l'écart pour que la somme vaille exactement 100.

## Conséquences

Proposition d'ajout à BR-QUI-03 : cas des modules de plus de 20 notions (couverture sur deux tentatives consécutives).
