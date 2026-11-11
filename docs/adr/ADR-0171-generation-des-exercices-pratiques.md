# ADR-0171 — Génération des exercices pratiques

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-613, SPEC-612, SPEC-615

## Contexte

Le catalogue demande la « génération des exercices par le tuteur » sans dire quand ni combien. BR-LAC-04 et BR-AUT-05 associent la difficulté d'application à un exercice ; la maquette `Programme.dc.html` propose un lien « Exercice pratique » pour le module en cours.

## Décision

1. **Exercice de module** : à l'événement `course/generated`, si la formation a l'objectif `operational`, `dialogue` ou `project`, le job `exercise-generate` crée **un** exercice (activité `exercise`, briques `purpose='exercise'`) portant sur 1 à 3 notions du module choisies par le tuteur. Sinon aucun exercice de module n'est créé.
2. **Exercice ciblé** : à l'événement `gap/detected` de nature `application` (y compris un changement de nature vers `application`), le job crée un exercice ciblé sur la notion, sauf si un exercice ciblé non tenté existe déjà pour cette notion.
3. Au plus **3 exercices non tentés** par module et par apprenant ; au-delà, la génération est ignorée et journalisée.
4. Tâche IA `tutor` ; le tuteur produit une brique `instruction` et une brique `scoring` (barème sur 10, 2 à 6 critères de 1 à 5 points, total 10) et au plus 2 indices.
5. Un exercice réussi (≥ 8/10) n'est plus proposé ; un exercice échoué peut être recommencé (nouvelle tentative, `attempt_no + 1`).

## Conséquences

Coût IA borné à 1 + n générations par module (n = lacunes d'application) ; fixtures `packages/llm/fixtures/tutor/exercise-*.json`.
