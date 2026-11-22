# ADR-2032 — Consommateur `generate-course` laissé en TypeScript faute de cas d'usage Python

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2207, SPEC-2204, ADR-2006, ADR-2014

## Contexte

La table de la section SPEC-2207 du plan P22 attribue le consommateur `generate-course` (événement
`chapter/contributions-completed`) au cas d'usage `tutor.generate_course`, porté par SPEC-2204. Or
aucun cas d'usage Python de génération de cours n'existe : `packages/jobs/src/functions/generate-course.ts`
appelle `generateCourseForModule` (`packages/tutor/src/course/generate.ts`, 902 lignes de pipeline
LLM), et seul `content.generate_course_now` — la demande HTTP, qui émet l'événement — a été porté.
La bascule groupée des consommateurs de SPEC-2207 ne peut donc pas câbler cette ligne sans porter un
contexte entier, hors du périmètre de la spécification.

## Décision

SPEC-2207 câble les 21 consommateurs dont le cas d'usage Python existe et laisse l'entrée
`tutor.generate_course` à `ts` dans `api/ownership.yaml`, avec un commentaire et un test unitaire
dédié (`test_the_only_typescript_consumer_is_the_unported_course_generation`) qui épinglent l'écart
pour qu'il ne soit pas oublié. Le reste de la table, les deux crons et les deux tâches du
planificateur passent à `py`. Aucune régression nouvelle n'est introduite : Inngest n'est plus
démarré par la pile de tests ni en production (ADR-2006, ADR-2014), donc ce consommateur était déjà
sans exécution avant la bascule.

## Conséquences

Le pipeline des banques de questions sur `course/generated` ne se déclenche pas tant que
`tutor.generate_course` n'est pas porté : c'est la dernière ligne à fermer avant le checkpoint
CP-22. Le test unitaire échouera volontairement quand l'entrée passera à `py`, ce qui forcera à
mettre à jour la documentation de l'écart. Les routes `dev.*`, l'e2e complet, `acceptance.md`,
`validate.mjs` et `complete.mjs` restent dans la tranche suivante de SPEC-2207.
