# ADR-0150 — Schémas normatifs des briques et charge publique

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-501, SPEC-502, SPEC-503, SPEC-506, SPEC-513

## Contexte

BR-BRI-01 à BR-BRI-07 et ADR-0027 fixent les 13 types de briques et leurs règles communes, mais ni les bornes de chaque champ, ni la façon d'envoyer une brique au navigateur sans divulguer la bonne réponse (quiz, examen). Les maquettes `Quiz.dc.html`, `QuizGlobal.dc.html`, `Exercice.dc.html` et `ExamenBlanc.dc.html` montrent des champs absents du catalogue legacy (données de la consigne, champs d'en-tête du tableau, explication écrite, colonne « Sens » dérivée, estimation de durée).

## Décision

1. Les schémas Zod de `packages/bricks/src/types/<type>/schema.ts` décrits dans SPEC-501 §6 sont normatifs (champs, bornes, règles de cohérence). Toute charge (`brick_versions.payload`) contient en plus le champ commun `sources` (0 à 10 références de passage).
2. La brique `instruction` (ADR-0027) est complétée, sans en changer le principe, par : `data` (puces de données, 0 à 8), `production.fields` (champs d'en-tête du tableau, 0 à 4, mêmes types que les colonnes), `explanationPrompt` (question « Expliquez avec vos mots », facultative, notée par un critère), `estimatedMinutes`, `passPoints` (défaut 8 sur 10) ; un contrôle `sum_equal` peut porter `leftLabel`, `rightLabel` et `sideColumnLabel` pour afficher la colonne dérivée « Sens » de la maquette.
3. Chaque type expose `toPublic(payload, seed)` qui produit la **charge publique** envoyée au navigateur avant correction : sans bonnes réponses, notions des distracteurs, éléments attendus, réponse modèle ni indices ; l'ordre des éléments mélangés est déterministe (graine = identifiant de la version de brique). Seule la carte de rappel conserve son verso (auto-évaluation).
4. Erreurs de validation : liste `BrickIssue { code, path, message }` (codes énumérés dans SPEC-501) ; côté API, `422 BRICK_INVALID` avec `errors`.

## Conséquences

Le navigateur ne peut pas lire la correction avant « Vérifier » ; la vue (SPEC-503) consomme la charge publique puis l'objet de correction renvoyé par le serveur (SPEC-502).
