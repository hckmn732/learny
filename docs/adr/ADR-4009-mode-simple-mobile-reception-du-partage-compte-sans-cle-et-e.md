# ADR-4009 — Mode simple mobile : réception du partage, compte sans clé et espace de libellés

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-24
- **Liens** : SPEC-4003, SPEC-4002, ADR-4002, ADR-3005

## Contexte

SPEC-4003 doit prouver la réception d'un document partagé et l'état sans clé sur Android. Expo Linking expose l'URI d'un intent VIEW/SEND mais pas les extras EXTRA_STREAM seuls ; l'espace i18n simple appartient à SPEC-4002 et n'est pas encore fusionné ; la campagne a besoin d'un compte sans aucune clé d'IA sans toucher au compte de démonstration.

## Décision

1) app.config.ts déclare ACTION_SEND et ACTION_SEND_MULTIPLE (PDF, DOCX, image) et un filtre VIEW file/content pour « Ouvrir avec Learny » ; src/simple/share.ts lit l'URI exposée par Expo Linking, les tests Maestro utilisent l'intent VIEW réel. 2) Les libellés du mode simple sont ajoutés dans packages/i18n/src/fr/mobileSimple.ts (espace mobile) tant que packages/i18n/src/fr/simple.ts n'est pas fusionné ; ils seront réconciliés au checkpoint CP-40 avec l'espace simple de SPEC-4002. 3) La campagne crée un compte nokey@demo.learny.test sans clé ni modèle, avec les acceptations légales et le profil du compte de démonstration copiés par e2e/setup/SPEC-4003-fixtures.mjs ; le compte de démonstration reste intact.

## Conséquences

La réception est prouvée par un intent Android réel ; les applications qui ne renseignent que EXTRA_STREAM sans data restent un cas non couvert par Expo Linking, documenté dans acceptance.md. Les libellés seront déplacés vers l'espace simple à la fusion de SPEC-4002. Le compte nokey est recréé de façon idempotente avant chaque campagne.
