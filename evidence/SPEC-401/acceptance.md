# SPEC-401 — critères d'acceptation

Tous les critères sont vérifiés par les tests du paquet, le test d'intégration et les tests e2e de
la page `/_dev/sdd/SPEC-401`.

- ✅ **CA-1** `pnpm --filter @learny/learning-engine test` passe (50 tests) et la couverture v8 du
  paquet est de 99,57 % de lignes, 100 % de fonctions, 86,27 % de branches — preuve :
  `unit.json`, `checks.json`.
- ✅ **CA-2** Aller-retour JSON de `AnswerRecord`, `NotionState`, `SerializedFsrsCard`,
  `Availability` et `ReviewEvent` sur 200 objets fast-check par type — preuve :
  `packages/learning-engine/src/types.test.ts`, `unit.json`.
- ✅ **CA-3** Les valeurs de `ENGINE` concordent avec la table CA-3 et les constantes existantes de
  `product.ts` — preuve : `packages/config/src/product.test.ts` (`[SPEC-401] concordance ENGINE`),
  `unit.json`.
- ✅ **CA-4** Les huit cas de temps donnent exactement les sorties attendues, y compris les
  changements d'heure et les fuseaux très décalés — preuve :
  `packages/learning-engine/src/time.test.ts`, `unit.json`.
- ✅ **CA-5** ESLint refuse un import inter-paquet dans `src` avec `import/no-restricted-paths` et
  `no-restricted-imports`, et accepte `src/index.ts` — preuve :
  `packages/learning-engine/test/integration/engine-boundaries.test.ts`, `integration.json`.
- ✅ **CA-6** Le jeu SAP contient 7 modules, 24 chapitres, 48 notions, un chapitre par notion et
  aucun lien réflexif (59 liens de la maquette) — preuve :
  `packages/learning-engine/src/fixtures/sap-reference.test.ts`, `unit.json`.
- ✅ **CA-7** La page affiche les 4 régions dans l'ordre, les cartes calculées, les 7 badges ✓ ; la
  route renvoie 404 sans `ENABLE_SDD_PAGES=true` — preuve : `apps/web/e2e/specs/p4/spec-401.spec.ts`,
  `e2e.json`, `video/`, `screenshots/spec-401-demo.png`, `@visual`.
