# ADR-0211 — Etapes et evaluation du projet fil rouge V2

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-906

## Contexte

BR-PRA-07 demande une suite de consignes sur la formation, des livrables evalues et une evaluation finale sans preciser leur cycle de vie ni leur effet sur la validation des modules V1.

## Décision

Une formation ayant l'objectif projet peut posseder un projet fil rouge versionne, avec au plus une etape active par module et une etape finale apres le dernier module. Chaque etape accepte un livrable texte, fichier ou lien, garde ses versions et recoit un retour par criteres sur 10; les retours intermediaires guident la suite mais ne changent pas le seuil de validation du module. L'evaluation finale note le livrable final sur 10 avec criteres explicites et synthese des etapes; elle apparait dans le bilan sans modifier retroactivement les quiz ni la maitrise FSRS. Les etapes sont planifiees dans l'agenda par le planificateur existant, avec dates replanifiees lors d'une pause ou d'un changement de rythme. Toute sortie IA de correction est validee par schema et bornee par le code; en panne, le livrable reste soumis en attente de correction.

## Conséquences

SPEC-906 separe progression du projet et progression des modules; les tests couvrent versions, planification, correction et bilan final.
