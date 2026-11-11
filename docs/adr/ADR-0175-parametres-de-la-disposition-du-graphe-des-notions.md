# ADR-0175 — Paramètres de la disposition du graphe des notions

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-616

## Contexte

ADR-0036 fixe le principe (forces, 420 itérations, graine fixe). La reproduction de la maquette `Carte.dc.html` et la tenue sur de grands graphes exigent des paramètres normatifs.

## Décision

1. Paramètres repris de la maquette : générateur Park–Miller (`seed = seed × 16807 mod 2147483647`, valeur `(seed − 1) / 2147483646`, graine 7) ; modules en cercle (rayon 230, angle `i/M·2π − π/2`) ; notions autour de `300 × axe du module` à un rayon 50 à 120 ; apports dans ±150 ; répulsion `2600 / d² × α` ; ressorts longueur/raideur : formation 190/0,04, contient 85/0,03, prérequis 70/0,05, confusion 60/0,05, tuteur 110/0,02, source 60/0,04 ; gravité 0,004 ; amortissement 0,55 ; déplacement borné à ±30 par itération ; `α = max(0,02 ; 1 − it/380)` ; 420 itérations ; formation fixée en (0, 0).
2. Ordre déterministe : nœuds triés (formation, modules par position, notions par module puis chapitre puis position, apports par date de création puis id) ; liens triés par (type, origine, destination). L'aléa n'est consommé que dans cet ordre.
3. Au-delà de 400 nœuds : répulsion limitée aux paires distantes de moins de 300 unités (grille spatiale de pas 300), 300 itérations, calcul dans un Web Worker ; budget 1,5 s pour 1 000 nœuds sur la machine de CI.
4. Les positions modifiées par glisser-déposer ne sont pas persistées.

## Conséquences

Une même formation produit toujours la même carte ; un test d'instantané vérifie les positions arrondies.
