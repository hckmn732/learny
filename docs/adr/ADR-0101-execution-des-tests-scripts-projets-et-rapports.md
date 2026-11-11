# ADR-0101 — Exécution des tests : scripts, projets et rapports

- **Statut** : Acceptée
- **Origine** : Déduite (décision prise lors de la rédaction des spécifications P0, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, SPEC-004, SPEC-011, ADR-0002, ADR-0070

## Contexte

`tools/sdd/validate.mjs` et `tools/sdd/checkpoint.mjs` appellent `pnpm -s test:unit|test:int|test:e2e` en ajoutant des arguments (`-t`, `--reporter=json --outputFile.json=…`, `--grep`, `--coverage`, `--project=cross-browser`) et attendent **un seul** rapport JSON agrégé, des vidéos Playwright, `test-results/playwright.xml`, et le JSON Playwright au chemin `PLAYWRIGHT_JSON_OUTPUT_FILE`. Passer ces arguments à travers `turbo run` (un processus par paquet) produirait des rapports multiples. Les e2e doivent tourner sur `next start` (testing.md §1) avec un build à jour.

## Décision

1. `test:unit` = `vitest run --project unit` et `test:int` = `vitest run --project integration`, lancés à la racine sur une configuration `vitest.config.ts` unique à deux projets (`unit`, `integration`) avec `passWithNoTests: true`. Les tâches homonymes restent déclarées dans `turbo.json` (ADR-0002) mais les scripts racine n'y passent pas.
2. `test:e2e` = `node apps/web/e2e/run-playwright.mjs` : construit l'application via le cache Turborepo (`turbo run build --filter=@learny/web...`, sauf `E2E_SKIP_BUILD=1`), sélectionne par défaut les projets `desktop` et `mobile` (le projet `mobile` ne joue que les tests étiquetés `@mobile`), traduit `--project=cross-browser` en `--project=cross-browser-firefox --project=cross-browser-webkit`, puis lance `playwright test -c apps/web/playwright.config.ts`.
3. Serveur e2e : `next start -p 3100` avec `ENABLE_SDD_PAGES=true`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `APP_ENV=test`.
4. Rapports Playwright : JSON à `process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? test-results/playwright.json`, JUnit `test-results/playwright.xml`, HTML `test-results/html` (jamais ouvert), artefacts `test-results/artifacts`, `video`, `trace` et `screenshot` à `on`, un seul worker.
5. Lignes de base `toHaveScreenshot` : `apps/web/e2e/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}`, `maxDiffPixelRatio: 0.01`, créées explicitement par `--update-snapshots` puis commitées. En CI, une ligne de base absente pour la plateforme de la CI ne fait pas échouer le test : l'assistant `expectScreenshotBaseline` (SPEC-004) joint la capture candidate et annote le test ; une ligne de base présente et différente échoue toujours.
6. L'outillage `tools/sdd/*.mjs` (sans dépendance, hors produit) est exempté de la règle ESLint interdisant `Date.now()`/`new Date()` et exclu de Prettier.

## Conséquences

Un seul rapport par niveau, compatible avec `validate.mjs` ; Firefox et WebKit ne sont installés et joués qu'aux checkpoints qui l'exigent.
