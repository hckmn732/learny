# ADR-0181 — Vérification et notation des jeux de mémorisation

- **Statut** : Acceptée
- **Origine** : Déduite (préparation du référentiel, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-702

## Contexte

La maquette `QuizGlobal.dc.html` permet de vérifier plusieurs fois un jeu et de recommencer à tout moment, alors que BR-MEM-10 impose un retour immédiat et que FSRS a besoin d'une note unique par notion. Un jeu (association, classement) couvre souvent plusieurs notions.

## Décision

1. Une seule vérification est notée et enregistrée par item de session ; ensuite la réponse est verrouillée et la correction (éléments juste/faux, réponse attendue, explication) reste affichée. « Recommencer » efface la saisie uniquement avant vérification.
2. « Vérifier » n'est actif que lorsque le jeu est complet (toutes les paires formées, tous les éléments classés, tous les trous remplis ; un ordre est toujours complet).
3. Note FSRS par notion : juste si tous les éléments rattachés à la notion sont justes ; temps de l'item réparti à parts égales entre ses notions ; règle BR-MEM-02 appliquée avec la médiane du format.
4. Une erreur d'association ou de classement qui rattache un élément de la notion A à la notion B (A ≠ B) est une confusion A↔B transmise au moteur de lacunes ; une erreur au sein d'une même notion ne l'est pas.
5. Texte à trous : normalisation NFD sans diacritiques, minuscules, espaces réduits, ponctuation finale retirée ; variantes déclarées dans la brique ; aucune tolérance orthographique supplémentaire.

## Conséquences

Les écarts avec la maquette (re-vérification libre) sont assumés ; l'apparence des états reste identique.
