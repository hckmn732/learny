# ADR-2026 — Copie verbatim des prédicats privés du service dans l'oracle tuteur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2204, ADR-2008

## Contexte

L'oracle de SPEC-2204 (`tools/oracles/tutor-vectors.mts`) enregistre le comportement réel de
`packages/services/src/tutor-chat/{stream,self-test}.ts`. Deux prédicats sont exportés par
`self-test.ts` (`looksInjection`, `asksForTest`), mais `mockGradeScenario` est privé. Importer
`@learny/services` depuis l'outillage de l'oracle tirerait les clients Postgres et LLM dans un script
qui doit rester sans dépendance, sans base et déterministe : ces clients lisent l'environnement au
chargement et rendraient l'enregistrement non reproductible.

## Décision

Conserver une copie verbatim de `looksInjection`, `asksForTest` et `mockGradeScenario` dans
`tools/oracles/tutor-helpers.ts`, avec les trois expressions régulières inchangées. Le port Python
(`learny.tutor.domain.turn`) est comparé à cette copie par
`packages-py/learny/tests/unit/tutor/test_tutor_domain_vectors.py`, c'est-à-dire aux mêmes valeurs
que celles du service. L'alternative — exporter `mockGradeScenario` du service et importer
`@learny/services` dans l'oracle — est écartée pour la raison ci-dessus.

## Conséquences

Trois helpers existent en double dans l'outillage. Une modification des expressions régulières côté
TypeScript exige de mettre la copie à jour puis de régénérer les vecteurs ; les assertions de
l'oracle ne sont jamais éditées (ADR-2008). La copie est signalée dans l'en-tête du fichier de
l'oracle et dans `evidence/SPEC-2204/acceptance.md`.
