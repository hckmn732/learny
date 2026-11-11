# ADR-0141 — Revue FSRS par notion et par tentative

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-402, SPEC-403, SPEC-411

## Contexte

Une tentative peut contenir plusieurs questions sur une même notion (surpondération des lacunes) et un jeu peut porter sur plusieurs notions. Appliquer une revue FSRS par réponse fausserait les intervalles (revues rapprochées de quelques secondes). La carte de rappel et l'échauffement sont auto-évalués ; leur contribution à la maîtrise n'est pas définie.

## Décision

1. Une seule revue FSRS par (notion, tentative) : note retenue = la plus basse des notes déduites de ses réponses dans la tentative (`again` < `hard` < `good` < `easy`), instant = celui de la dernière de ces réponses. Dans une session de quiz global (une notion n'y figure qu'une fois), la revue est appliquée dès la réponse.
2. Une réponse qui porte sur plusieurs notions (association, classement…) produit une revue pour chacune de ses notions.
3. Une réponse plus ancienne que la dernière revue de la carte (rejeu hors ligne) est journalisée (`review_logs` avec `fsrs_after = fsrs_before`) et compte pour la maîtrise, mais n'est pas appliquée à FSRS.
4. Réussite d'une réponse pour la maîtrise : `score / maxScore` si la réponse est notée ; sinon auto-évaluation `again` → 0, `hard`/`good`/`easy` → 1 ; sinon `correct` → 1 ou 0. Une réponse non encore corrigée (question ouverte en attente) est ignorée. Une réponse est un **échec** si sa réussite est < 0,5.
5. Échauffement : « Je savais » → `good`, « À revoir » → `again`.
6. Médiane du temps de réponse : 50 dernières réponses de l'apprenant pour le format, toutes formations confondues, hors auto-évaluations ; 20 000 ms s'il y en a moins de 5 ; médiane d'un nombre pair = moyenne des deux valeurs centrales arrondie à l'entier inférieur.

## Conséquences

`review_logs` reçoit une ligne par revue (et non par réponse) ; `answer_id` référence la dernière réponse retenue.
