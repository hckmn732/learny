# ADR-0323 — Contrats, correction et rendu des quatre jeux de mémorisation

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-702, ADR-0181, ADR-0024, ADR-0025, ADR-0020, ADR-0180

## Contexte

SPEC-702 assemble les briques matching, ordering, categorization et cloze dans le quiz global. Les schémas de brique de SPEC-501 parlent des enregistrements d'identifiants opaques et ne rattachent pas chaque étape, élément ou trou à une notion ; le démonstration stocke en plus un titre de cloze hors schéma strict. Le contrat de réponse de jeu de SPEC-702 (tableaux de paires, d'affectations et de trous) diffère donc du schéma de correction de brique, et la note FSRS par notion doit rester définissable.

## Décision

1. Les contrats exposent des tableaux typés par jeu (paires, ordre, affectations, trous) et une correction discriminée par kind ; le service traduit vers les enregistrements de gradeBrick puis reconstruit la correction de contrat. 2. Une réponse incomplète ou un identifiant inconnu devient VALIDATION_FAILED (400) avant toute écriture. 3. La répartition par notion utilise le notionId des paires d'association et celui des catégories de classement ; les éléments sans notion rattachée retombent sur le résultat global de l'item, et l'ordre/le texte à trous restent mono-décision. 4. Les confusions proviennent du gradeur (association, classement) et sont transmises à applyReviewResult via confusedWithNotionId, ainsi que dans feedback.confusions. 5. La validation CL-7 ignore le champ d'affichage title du cloze de démonstration avant de parser le schéma ; tout autre écart retire la brique. 6. Le mélange d'affichage des définitions utilise seededShuffle (FNV-1a + mulberry32) avec l'identifiant de version comme graine.

## Conséquences

Le stockage answers.score utilise une échelle 0..1 avec max_score = 1 pour les jeux, tandis que la carte de rappel conserve 0..100 ; scoreValue normalise les deux. La correction du contrat ajoute le given d'un trou (facultatif) pour la relecture après rechargement. Aucune route ni colonne nouvelle.
