---
id: SPEC-001
title: Monorepo, application web minimale et socle de tests
phase: P0
priority: V1
depends_on: []
business_rules: [BR-PLA-04]
screens: []
adrs: [ADR-0002, ADR-0003, ADR-0004, ADR-0070, ADR-0100, ADR-0101, ADR-0102]
visual: demo
---

# SPEC-001 — Monorepo, application web minimale et socle de tests

## 1. Objectif

Amorcer le dépôt Learny : monorepo pnpm/Turborepo en TypeScript strict, application `apps/web` Next.js minimale (page d'accueil provisoire, route `/api/v1/health`, page de démonstration `/_dev/sdd/SPEC-001`), paquets `@learny/core` et `@learny/config`, et un socle de tests (Vitest projets `unit` et `integration`, Playwright Chromium avec vidéo) **suffisant pour que `node tools/sdd/validate.mjs SPEC-001` réussisse avec ce que la spécification installe elle-même**.

## 2. Contexte

C'est la première spécification exécutée ; aucune autre n'existe avant elle. Elle crée le squelette décrit dans `docs/architecture/overview.md` §3 et les outils imposés par `docs/engineering/conventions.md` §1–§3. Elle doit être compatible avec l'outillage existant `tools/sdd/*.mjs`, en particulier :

- `tools/sdd/validate.mjs` exige dans `package.json` racine les scripts `lint`, `typecheck`, `build`, `test:unit`, `test:int`, `test:e2e` ; il lance `pnpm -s test:unit -t "SPEC-001" --reporter=default --reporter=json --outputFile.json="<fichier>"` (idem `test:int`), puis `pnpm -s test:e2e --grep "@SPEC-001"` avec les variables `PLAYWRIGHT_JSON_OUTPUT_FILE` et `PLAYWRIGHT_JSON_OUTPUT_NAME` pointant vers `test-results/sdd/SPEC-001/e2e.json` ; il compte les tests dont le titre complet contient `[SPEC-001]` (Vitest) ou `@SPEC-001` (Playwright), les vidéos (pièces jointes nommées `video`) et les tests `@visual`.
- `tools/sdd/evidence.mjs` copie `test-results/playwright.xml` (JUnit) et les pièces jointes Playwright.
- `tools/sdd/checkpoint.mjs` lance `pnpm -s test:unit --coverage`, `pnpm -s test:int`, `pnpm -s test:e2e` sans filtre.

Documents à lire : `docs/engineering/conventions.md`, `docs/engineering/testing.md` §1–§4, `docs/engineering/git.md`, `docs/architecture/overview.md` §1 et §3, ADR-0002, ADR-0003, ADR-0004, ADR-0047, ADR-0049, ADR-0070, ADR-0100, ADR-0101, ADR-0102.

## 3. Dépendances

- Spécifications prérequises : aucune.
- Outils système : Node.js 24 LTS, pnpm 10 (activé par `corepack enable`), Git ≥ 2.40. Si `git rev-parse --is-inside-work-tree` échoue, le dépôt est initialisé selon ADR-0100 (étape 1 de la section 8).
- Bibliothèques (dernière version stable à l'installation, figée par `pnpm-lock.yaml`, majeures minimales de `conventions.md` §1) : `turbo` ≥ 2, `typescript` ≥ 5.9, `next` ≥ 15, `react`/`react-dom` ≥ 19, `tailwindcss` ≥ 4 et `@tailwindcss/postcss`, `vitest` ≥ 3, `@vitest/coverage-v8` (même version que vitest), `@playwright/test` ≥ 1.50, `eslint` ≥ 9, `typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `@next/eslint-plugin-next`, `prettier` ≥ 3, `zod` ≥ 4.
- Navigateur Playwright : `pnpm exec playwright install chromium` (téléchargement officiel Playwright). Indisponibilité réseau : `node tools/sdd/fail.mjs SPEC-001 "Téléchargement de Chromium impossible" --external`.
- Aucun service externe (pas de base, pas d'IA) : la route de santé de cette spécification ne contacte rien.

## 4. Règles métier couvertes

- **BR-PLA-04** (données hébergées dans l'UE) : la spécification fige dans `packages/config/src/platform.ts` la constante `HOSTING_REGIONS` (`vercel: 'fra1'`, `supabase: 'eu-central-1'`, `inngest: 'eu'` pour la région déclarée côté application) et la fonction `isEuRegion(region)` ; un test unitaire vérifie que toutes les régions déclarées sont en UE et la page de démonstration les affiche. Les spécifications de déploiement (SPEC-008, SPEC-013) consomment cette constante ; aucune région hors UE ne peut être ajoutée sans faire échouer ce test.

## 5. Exigences fonctionnelles

- **EF-1** — `pnpm install` à la racine installe tout le monorepo sans erreur ; `pnpm dev` démarre `apps/web` sur `http://localhost:3000`.
- **EF-2** — `GET /` affiche la page d'accueil provisoire : titre `h1` « Learny », paragraphe « Application en cours de construction. », lien « Pages de démonstration » vers `/_dev/sdd` (lien rendu uniquement si `ENABLE_SDD_PAGES=true`). Les textes proviennent de `apps/web/messages/fr.ts`.
- **EF-3** — `GET /api/v1/health` répond `200`, en-tête `content-type: application/json`, corps `{ "status": "ok" }` (forme minimale, complétée par SPEC-006 sans retirer le champ `status`) et en-tête `cache-control: no-store`.
- **EF-4** — `GET /_dev/sdd/SPEC-001` (si `ENABLE_SDD_PAGES=true`) affiche la page de démonstration décrite en section 10 ; sinon réponse 404.
- **EF-5** — Les scripts racine suivants existent et fonctionnent : `dev`, `build`, `lint`, `typecheck`, `test:unit`, `test:int`, `test:e2e`, `test:visual`, `format`, `format:check`.
- **EF-6** — `node tools/sdd/validate.mjs SPEC-001` réussit toutes ses étapes (lint, typecheck, build, unit, integration, e2e avec vidéo, visual, acceptance).

## 6. Exigences techniques

- **ET-1 — Racine** :
  - `package.json` : `"name": "learny"`, `"private": true`, `"type": "module"`, `"packageManager": "pnpm@10.<x>.<y>"` (version exacte installée), `"engines": { "node": ">=24 <25", "pnpm": ">=10 <11" }`.
  - Scripts exacts :
    - `"dev": "turbo run dev --filter=@learny/web"`
    - `"build": "turbo run build"`
    - `"lint": "turbo run lint && pnpm run lint:root"` ; `"lint:root": "eslint --max-warnings=0 tools *.config.ts *.config.mjs"`
    - `"typecheck": "turbo run typecheck && tsc -p tsconfig.tools.json --noEmit"`
    - `"test:unit": "vitest run --project unit"`
    - `"test:int": "vitest run --project integration"`
    - `"test:e2e": "node apps/web/e2e/run-playwright.mjs"`
    - `"test:visual": "node apps/web/e2e/run-playwright.mjs --grep @visual"`
    - `"format": "prettier --write ."`, `"format:check": "prettier --check ."`
  - Les arguments ajoutés par `validate.mjs` (`-t`, `--reporter`, `--outputFile.json`, `--grep`, `--coverage`, `--project`) sont transmis tels quels par pnpm au dernier programme de la commande (ADR-0101).
  - `pnpm-workspace.yaml` : `packages: ['apps/*', 'packages/*']`.
  - `turbo.json` (schéma `https://turbo.build/schema.json`) : tâches `build` (`dependsOn: ['^build']`, `outputs: ['.next/**', '!.next/cache/**', 'dist/**']`), `dev` (`cache: false`, `persistent: true`), `lint` (`dependsOn: ['^lint']`), `typecheck` (`dependsOn: ['^typecheck']`), `test:unit`, `test:int`, `test:e2e` (`cache: false`) déclarées pour ADR-0002 ; `globalPassThroughEnv` : `["CI", "APP_ENV", "ENABLE_SDD_PAGES", "CLOCK_FIXED_AT", "LLM_MODE", "NODE_ENV", "PORT"]` (liste complétée par SPEC-009).
  - `.nvmrc` = `24` ; `.editorconfig` (UTF-8, LF, indentation 2 espaces, `insert_final_newline = true`, `trim_trailing_whitespace = true` sauf `*.md`) ; `.gitattributes` : `* text=auto eol=lf` ; `.prettierrc.json` : `{ "printWidth": 100, "singleQuote": true, "trailingComma": "all" }` ; `.prettierignore` : `pnpm-lock.yaml`, `design/`, `docs/legacy/`, `evidence/`, `progress/`, `test-results/`, `coverage/`, `.next/`, `dist/`, `tools/sdd/`, `specs/`, `docs/adr/`.
  - `.gitignore` : `node_modules/`, `.env*` sauf `!.env.example`, `.next/`, `dist/`, `out/`, `test-results/`, `playwright-report/`, `coverage/`, `.turbo/`, `supabase/.temp/`, `.sdd/lock.json`, `*.tsbuildinfo`, `next-env.d.ts`.
- **ET-2 — TypeScript** : `tsconfig.base.json` : `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2023"`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `jsx: "preserve"`, `resolveJsonModule: true`, `isolatedModules: true`, `verbatimModuleSyntax: true`, `skipLibCheck: true`, `noEmit: true`. Chaque paquet a un `tsconfig.json` qui l'étend. `tsconfig.tools.json` (racine) couvre `tools/**/*.ts`, `vitest.config.ts`, `eslint.config.mjs` avec `allowJs: true`, `checkJs: false`.
- **ET-3 — Paquets** (convention `conventions.md` §3, paquets « internes » sans étape de compilation : `exports` pointe vers `src/*.ts`) :
  - `packages/core` (`@learny/core`) : `src/index.ts`, `src/clock.ts` qui exporte `interface Clock { now(): Date }`, `const systemClock: Clock`, `function createClockFromEnv(env?: Record<string, string | undefined>): Clock` (si `CLOCK_FIXED_AT` est une date ISO valide, horloge figée ; sinon horloge système ; valeur invalide → `Error('CLOCK_FIXED_AT invalide : <valeur>')`), `let clock: Clock` (initialisé par `createClockFromEnv(process.env)`), `function setClock(c: Clock): void` (tests). Seul fichier autorisé à appeler `Date.now()`/`new Date()` sans argument.
  - `packages/config` (`@learny/config`) : `src/index.ts`, `src/platform.ts` (`HOSTING_REGIONS`, `EU_REGIONS = ['fra1', 'cdg1', 'arn1', 'dub1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1', 'eu-south-1', 'eu']`, `isEuRegion(region: string): boolean`).
  - Scripts de chaque paquet : `"lint": "eslint --max-warnings=0 ."`, `"typecheck": "tsc --noEmit"`.
- **ET-4 — Application web** (`apps/web`, `@learny/web`) : Next.js App Router, React 19, Tailwind 4 (`app/globals.css` contient `@import "tailwindcss";`, `postcss.config.mjs` avec `@tailwindcss/postcss`). `next.config.ts` : `transpilePackages: ['@learny/core', '@learny/config']`, `poweredByHeader: false`, `reactStrictMode: true`. Scripts : `"dev": "next dev -p 3000"`, `"build": "next build"`, `"start": "next start -p 3000"`, `"lint": "eslint --max-warnings=0 ."`, `"typecheck": "tsc --noEmit"`. Fichiers : `app/layout.tsx` (`<html lang="fr">`, métadonnées `title: 'Learny'`), `app/page.tsx`, `app/api/v1/health/route.ts` (`export const dynamic = 'force-dynamic'`), `messages/fr.ts`, page de démonstration (ADR-0102) : `app/%5Fdev/sdd/[specId]/page.tsx`, `app/%5Fdev/sdd/registry.ts`, `components/sdd/demo-shell.tsx`, `components/sdd-demos/spec-001.tsx`, `lib/sdd-pages.ts` (`export function sddPagesEnabled(env = process.env): boolean` → `env.ENABLE_SDD_PAGES === 'true' && env.APP_ENV !== 'production'`).
- **ET-5 — ESLint** (`eslint.config.mjs` racine, configuration plate, utilisée par tous les paquets) : `typescript-eslint` `strictTypeChecked` sur `**/*.{ts,tsx}` (avec `parserOptions.projectService: true`), `react-hooks` (recommandé), `jsx-a11y` (recommandé), `@next/next` sur `apps/web/**`, `import` : `import/no-cycle: error`, `import/order: error` (groupes builtin, external, internal `@learny/**`, parent, sibling), `import/no-restricted-paths` avec les zones de `docs/architecture/overview.md` §3 :
  - cible `packages/learning-engine` : interdit d'importer `packages/*` sauf `packages/core` ;
  - cible `packages/bricks` : seulement `core`, `contracts`, `ui` ;
  - cible `packages/llm` : seulement `core`, `config`, `contracts`, `db` ;
  - cible `packages/tutor` : seulement `llm`, `bricks`, `learning-engine`, `contracts`, `core`, `db`, `ingestion` ;
  - cible `packages/services` : interdit `packages/ui` ;
  - cible `packages/*` : interdit `apps/*`.
  Les zones s'appliquent aussi aux imports par nom de paquet `@learny/<x>` grâce à la règle `no-restricted-imports` avec `patterns` équivalents définis par cible (bloc `files: ['packages/<cible>/**']`).
  - `no-restricted-syntax` (erreur) sur `CallExpression[callee.object.name='Date'][callee.property.name='now']` (message « Utiliser clock.now() de @learny/core (ADR-0047). ») et `NewExpression[callee.name='Date'][arguments.length=0]` (même message). Exemptions : `packages/core/src/clock.ts`, `tools/sdd/**` (outillage hors produit, ADR-0101).
  - Ignorés : `**/node_modules/**`, `**/.next/**`, `**/dist/**`, `test-results/**`, `coverage/**`, `design/**`, `docs/**`, `evidence/**`, `progress/**`.
- **ET-6 — Vitest** (`vitest.config.ts` racine, ADR-0101) : `test.projects` = `[{ extends: true, test: { name: 'unit', include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}', 'apps/web/{app,components,lib,messages}/**/*.test.{ts,tsx}', 'tools/**/test/unit/**/*.test.ts'], environment: 'node' } }, { extends: true, test: { name: 'integration', include: ['packages/*/test/integration/**/*.test.ts', 'apps/*/test/integration/**/*.test.ts', 'tools/**/test/integration/**/*.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 120000, fileParallelism: false } }]` ; options communes : `passWithNoTests: true`, `env: { CLOCK_FIXED_AT: '2026-11-11T12:20:00Z', LLM_MODE: 'mock', TZ: 'UTC' }`, `coverage: { provider: 'v8', reportsDirectory: 'coverage', reporter: ['text-summary', 'json-summary', 'html'] }`, résolution des alias `@learny/*` via les `exports` des paquets. Les tests de composants React utilisent l'en-tête `// @vitest-environment jsdom` (dépendance `jsdom`).
- **ET-7 — Playwright** (`apps/web/playwright.config.ts`, `testDir: './e2e/specs'`) :
  - `const ROOT = fileURLToPath(new URL('../../', import.meta.url))` ;
  - `outputDir: path.join(ROOT, 'test-results/artifacts')`, `snapshotPathTemplate: '{testDir}/../__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}'`, `fullyParallel: false`, `workers: 1`, `retries: 0`, `forbidOnly: !!process.env.CI`, `timeout: 60000` ;
  - `reporter: [['list'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? path.join(ROOT, 'test-results/playwright.json') }], ['junit', { outputFile: path.join(ROOT, 'test-results/playwright.xml') }], ['html', { outputFolder: path.join(ROOT, 'test-results/html'), open: 'never' }]]` ;
  - `use: { baseURL: 'http://127.0.0.1:3100', trace: 'on', video: 'on', screenshot: 'on', viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' }` ;
  - `projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }]` (projets `mobile` et `cross-browser-*` ajoutés par SPEC-004) ;
  - `webServer: { command: 'pnpm --filter @learny/web exec next start -p 3100', url: 'http://127.0.0.1:3100/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 120000, env: { ENABLE_SDD_PAGES: 'true', CLOCK_FIXED_AT: '2026-11-11T12:20:00Z', LLM_MODE: 'mock', APP_ENV: 'test' } }`.
- **ET-8 — Lanceur e2e** `apps/web/e2e/run-playwright.mjs` (Node, sans dépendance) : (1) sauf si `E2E_SKIP_BUILD=1`, exécute `pnpm exec turbo run build --filter=@learny/web... --output-logs=errors-only` (cache Turborepo : reconstruit seulement si les sources ont changé) et sort avec son code en cas d'échec ; (2) si aucun argument ne commence par `--project`, ajoute `--project=desktop` ; (3) lance `pnpm exec playwright test -c apps/web/playwright.config.ts <arguments>` depuis la racine (`spawnSync`, `stdio: 'inherit'`, `shell: true` sous Windows) et sort avec son code de sortie.
- **ET-9 — Route de santé** : `GET` uniquement ; autres méthodes → 405 (comportement par défaut de Next.js) ; aucune dépendance réseau ; temps de réponse < 50 ms en local.
- **ET-10 — Sécurité** : aucun secret ni `.env` versionné ; `ENABLE_SDD_PAGES` est lu **à l'exécution** (pages en `dynamic = 'force-dynamic'`), jamais à la construction (ADR-0102).

## 7. Comportements attendus et cas limites

- **CL-1** — Dépôt non initialisé (`git rev-parse` échoue) → initialisation selon ADR-0100 avant toute autre étape ; si `user.name`/`user.email` ne sont pas configurés, identité locale au dépôt `Learny SDD Agent <sdd-agent@learny.invalid>`.
- **CL-2** — `ENABLE_SDD_PAGES` absent, vide, `false`, `1` ou `TRUE`, ou `APP_ENV=production` → `/_dev/sdd/SPEC-001` répond 404 (seule la valeur exacte `true` hors production active les pages).
- **CL-3** — `specId` bien formé mais absent du catalogue (le test construit `SPEC-` suivi de `999`) ou mal formé (`/_dev/sdd/abc`) avec pages activées → 404 (`notFound()`).
- **CL-4** — `CLOCK_FIXED_AT` invalide (`2026-13-45`) → `createClockFromEnv` lève `Error('CLOCK_FIXED_AT invalide : 2026-13-45')` ; la page de démonstration n'est jamais rendue avec une date incohérente.
- **CL-5** — `pnpm test:int` sans aucun test d'intégration correspondant au filtre → code 0 grâce à `passWithNoTests` ; `validate.mjs` échoue néanmoins faute de test `[SPEC-001]` réussi, d'où l'obligation du test d'intégration de la section 12.
- **CL-6** — Port 3100 déjà occupé par un serveur Learny local → réutilisé hors CI (`reuseExistingServer`) ; en CI, échec explicite de Playwright.
- **CL-7** — Ajout d'un `Date.now()` dans `packages/config/src/platform.ts` → `pnpm lint` échoue avec le message de ET-5 (test de la section 12).
- **CL-8** — Import de `@learny/web` depuis un paquet ou d'`apps/web/lib/x` depuis `packages/core` → `pnpm lint` échoue (`import/no-restricted-paths` / `no-restricted-imports`).
- **CL-9** — Construction sous Windows : chemins calculés avec `path`/`fileURLToPath`, jamais par concaténation de `/`.
- **CL-10** — Requête `POST /api/v1/health` → 405.

## 8. Instructions d'implémentation

1. **Amorçage Git (ADR-0100)** : si le répertoire n'est pas un dépôt, `git init -b main`, configurer l'identité locale si absente (CL-1), créer `.gitignore` (ET-1) puis committer l'état existant du référentiel : `git add -A && git commit -m "chore(sdd): initialise le référentiel"`. Relancer `node tools/sdd/start.mjs SPEC-001` (reprise) pour créer la branche `spec/SPEC-001-monorepo-application-web-minimale-et-soc` ; si la branche n'a pas été créée (dépôt créé après le démarrage), la créer : `git checkout -b spec/SPEC-001-monorepo-application-web-minimale-et-soc`. Ne jamais ajouter de remote.
2. `corepack enable`, créer `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `tsconfig.base.json`, `tsconfig.tools.json` (ET-1, ET-2). Installer les dépendances de développement racine. Commit `build(SPEC-001): initialise le monorepo pnpm et Turborepo`.
3. Créer `packages/core` (clock) et `packages/config` (platform) avec `package.json` (`"name": "@learny/core"`, `"exports": { ".": "./src/index.ts" }`, `"type": "module"`), `tsconfig.json`, `README.md` (rôle, API publique). Commit `feat(SPEC-001): ajoute les paquets core et config`.
4. Créer `apps/web` (ne pas utiliser `create-next-app` interactif : écrire les fichiers à la main), `next.config.ts`, Tailwind 4, `layout.tsx`, `page.tsx`, `messages/fr.ts` (objet `fr` typé `as const` avec `home: { title: 'Learny', subtitle: 'Application en cours de construction.', demoLink: 'Pages de démonstration' }` et `sdd: {...}` de la section 10), route de santé. Commit `feat(SPEC-001): crée l'application web minimale et la route de santé`.
5. Créer `lib/sdd-pages.ts`, `components/sdd/demo-shell.tsx`, `app/%5Fdev/sdd/registry.ts` (`export const sddDemos: Record<string, { title: string; load: () => Promise<{ default: React.ComponentType }> }>` avec l'entrée `SPEC-001`), `app/%5Fdev/sdd/[specId]/page.tsx` (`dynamic = 'force-dynamic'` ; si `!sddPagesEnabled()` ou `specId` absent du registre → `notFound()` ; sinon rend `DemoShell` avec le composant chargé) et `components/sdd-demos/spec-001.tsx` (section 10). Commit `feat(SPEC-001): ajoute la page de démonstration SDD`.
6. Écrire `eslint.config.mjs` (ET-5) et corriger tout le code jusqu'à `pnpm lint` vert. Commit `build(SPEC-001): configure ESLint, Prettier et les frontières de paquets`.
7. Écrire `vitest.config.ts` (ET-6), `apps/web/playwright.config.ts` (ET-7), `apps/web/e2e/run-playwright.mjs` (ET-8). `pnpm exec playwright install chromium`. Commit `build(SPEC-001): configure Vitest et Playwright`.
8. Écrire les tests de la section 12. Créer la ligne de base visuelle : `pnpm test:e2e --grep "@SPEC-001 @visual" --update-snapshots` puis vérifier la capture produite dans `apps/web/e2e/__screenshots__/`. Commit `test(SPEC-001): ajoute les tests unitaires, d'intégration et e2e`.
9. `pnpm lint && pnpm typecheck && pnpm build && pnpm test:unit && pnpm test:int && pnpm test:e2e` ; corriger jusqu'au vert.
10. `node tools/sdd/validate.mjs SPEC-001`, compléter `evidence/SPEC-001/acceptance.md` (✅ + preuve par critère), relancer `validate.mjs`, puis `node tools/sdd/complete.mjs SPEC-001`.

## 9. Fichiers et composants concernés

- **Créés** : `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `tsconfig.base.json`, `tsconfig.tools.json`, `eslint.config.mjs`, `vitest.config.ts` ; `packages/core/{package.json,tsconfig.json,README.md,src/index.ts,src/clock.ts,src/clock.test.ts}` ; `packages/config/{package.json,tsconfig.json,README.md,src/index.ts,src/platform.ts,src/platform.test.ts}` ; `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,playwright.config.ts}`, `apps/web/app/{layout.tsx,page.tsx,globals.css}`, `apps/web/app/api/v1/health/route.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/app/%5Fdev/sdd/[specId]/page.tsx`, `apps/web/components/sdd/demo-shell.tsx`, `apps/web/components/sdd-demos/spec-001.tsx`, `apps/web/lib/sdd-pages.ts`, `apps/web/lib/sdd-pages.test.ts`, `apps/web/messages/fr.ts`, `apps/web/test/integration/health.test.ts`, `apps/web/test/integration/tooling.test.ts`, `apps/web/e2e/run-playwright.mjs`, `apps/web/e2e/specs/p0/spec-001.spec.ts`, `apps/web/e2e/__screenshots__/…` (ligne de base).
- **Modifiés** : aucun fichier existant du référentiel (sauf création de `.gitignore` et initialisation Git si nécessaire).
- **Lus / réutilisés** : `tools/sdd/validate.mjs`, `tools/sdd/evidence.mjs`, `tools/sdd/checkpoint.mjs` (contrats de scripts et de rapports).

## 10. Interface et conformité visuelle

Mode `demo` (ADR-0049, ADR-0102). Pas de maquette.

**Coquille commune des pages de démonstration** (`components/sdd/demo-shell.tsx`, réutilisée par toutes les spécifications) : `<main data-testid="sdd-demo" class="mx-auto max-w-4xl p-8">` contenant dans l'ordre : sur-titre `p[data-testid="sdd-demo-spec"]` = identifiant (`SPEC-001`), titre `h1[data-testid="sdd-demo-title"]` = titre de la spécification, horodatage `p[data-testid="sdd-demo-clock"]` = « Horloge du serveur : 11/11/2026 13:20:00 (Europe/Paris) » formaté par `Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' })` à partir de `clock.now()`, puis le contenu propre à la spécification. Styles : fond blanc, texte `#111113`, police système (les polices produit arrivent avec SPEC-006), sections `section` avec `h2` et bordure `1px solid #E7E6E1`, rayon `16px`, marge 24 px.

**Contenu de `/_dev/sdd/SPEC-001`** (composant `spec-001.tsx`, Server Component) :
1. Section `data-testid="spec-001-workspace"`, `h2` « Espace de travail » : tableau (`table`, en-têtes « Paquet », « Rôle ») listant `@learny/web`, `@learny/core`, `@learny/config` lus depuis une constante `WORKSPACE_PACKAGES` du composant.
2. Section `data-testid="spec-001-health"`, `h2` « Santé de l'API » : résultat d'un appel serveur à la fonction `getHealth()` partagée avec la route (pas de requête HTTP) affiché `status : ok`.
3. Section `data-testid="spec-001-regions"`, `h2` « Hébergement (BR-PLA-04) » : liste `ul` des entrées de `HOSTING_REGIONS` (« Vercel : fra1 — UE », « Supabase : eu-central-1 — UE », « Inngest : eu — UE ») ; chaque ligne porte `data-testid="region-<service>"`.
4. Section `data-testid="spec-001-clock"`, `h2` « Horloge injectable » : « CLOCK_FIXED_AT = 2026-11-11T12:20:00Z » et « clock.now() = 2026-11-11T12:20:00.000Z ».

Contrôles visuels (testing.md §6, contrôles 2 et 4) : structure (présence et ordre des quatre sections, textes exacts ci-dessus) et non-régression `toHaveScreenshot('spec-001-demo.png', { fullPage: true, maxDiffPixelRatio: 0.01 })`. Accessibilité : un seul `h1`, hiérarchie `h1 > h2`, tableau avec `th scope="col"`.

## 11. Critères d'acceptation

- **CA-1** — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` et `pnpm build` se terminent avec le code 0 sur un clone propre.
- **CA-2** — `GET /api/v1/health` renvoie 200, `{ "status": "ok" }` et `cache-control: no-store` ; `POST` renvoie 405.
- **CA-3** — `pnpm test:unit -t SPEC-001` et `pnpm test:int -t SPEC-001` exécutent au moins 1 test `[SPEC-001]` chacun, tous réussis, et produisent un rapport JSON exploitable avec `--reporter=json --outputFile.json=<f>`.
- **CA-4** — `pnpm test:e2e --grep @SPEC-001` exécute le parcours de démonstration sur Chromium, produit au moins une vidéo (`video`), `test-results/playwright.xml` et le JSON au chemin de `PLAYWRIGHT_JSON_OUTPUT_FILE`.
- **CA-5** — La règle ESLint refuse `Date.now()` et `new Date()` hors `packages/core/src/clock.ts` et refuse un import de `apps/*` depuis `packages/*`.
- **CA-6** — `/_dev/sdd/SPEC-001` répond 404 sans `ENABLE_SDD_PAGES=true` et affiche les quatre sections avec `ENABLE_SDD_PAGES=true`.
- **CA-7** — Toutes les régions de `HOSTING_REGIONS` sont reconnues comme UE par `isEuRegion` (BR-PLA-04).

## 12. Plan de tests

- **Unitaires** :
  - `packages/core/src/clock.test.ts` — `describe('[SPEC-001] clock')` : horloge figée sur `2026-11-11T12:20:00Z` (`now().toISOString() === '2026-11-11T12:20:00.000Z'`) ; deux appels successifs renvoient la même valeur ; sans `CLOCK_FIXED_AT`, `systemClock` est utilisé ; valeur invalide → erreur au message exact (CL-4) ; `setClock` remplace l'horloge.
  - `packages/config/src/platform.test.ts` — `describe('[SPEC-001] platform regions')` : chaque valeur de `HOSTING_REGIONS` satisfait `isEuRegion` ; `isEuRegion('iad1') === false`, `isEuRegion('us-east-1') === false`.
  - `apps/web/lib/sdd-pages.test.ts` — `describe('[SPEC-001] sddPagesEnabled')` : `true` seulement pour `ENABLE_SDD_PAGES='true'` hors production (cas `undefined`, `''`, `'false'`, `'1'`, `'TRUE'` → `false` ; `'true'` avec `APP_ENV='production'` → `false`).
- **Intégration** :
  - `apps/web/test/integration/health.test.ts` — `describe('[SPEC-001] GET /api/v1/health')` : importe le `GET` du route handler, l'appelle avec une `Request` et vérifie statut 200, JSON `{ status: 'ok' }`, en-tête `cache-control: no-store`.
  - `apps/web/test/integration/tooling.test.ts` — `describe('[SPEC-001] tooling')` : (a) lit `package.json` racine et vérifie la présence des 10 scripts de EF-5 ; (b) exécute `ESLint` via son API Node (`new ESLint({ cwd: ROOT, overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }] })` — désactivation des règles typées car les fichiers sont virtuels —, puis `lintText`) sur un texte `export const t = Date.now();` avec `filePath: 'packages/config/src/fixture.ts'` → au moins un message de `no-restricted-syntax` ; même texte avec `filePath: 'packages/core/src/clock.ts'` → aucun message de cette règle ; texte `import x from '../../../apps/web/lib/sdd-pages';` avec `filePath: 'packages/core/src/fixture.ts'` → message `import/no-restricted-paths` ; (c) `isEuRegion` pour chaque région (doublon volontaire de CA-7 côté intégration).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-001.spec.ts` :
  - `test('accueil provisoire et santé @SPEC-001')` : `page.clock.setFixedTime(new Date('2026-11-11T12:20:00Z'))` ; ouvrir `/` → `h1` « Learny » et « Application en cours de construction. » ; `request.get('/api/v1/health')` → 200 et `status: 'ok'` ; `request.post('/api/v1/health')` → 405.
  - `test('page de démonstration SPEC-001 @SPEC-001')` : ouvrir `/_dev/sdd/SPEC-001` ; vérifier `sdd-demo-spec` = `SPEC-001`, `sdd-demo-title`, l'horloge « 11/11/2026 13:20:00 », les quatre sections et leurs textes ; ouvrir la page d'un identifiant bien formé absent du catalogue (`SPEC-` suivi de `999`) → statut 404.
  - Vidéo enregistrée pour chaque test (`video: 'on'`).
- **Visuel** — `test('démonstration SPEC-001 conforme @SPEC-001 @visual')` : vérifie l'ordre des sections (`locator('[data-testid^="spec-001-"]')` → `workspace`, `health`, `regions`, `clock`) puis `expect(page).toHaveScreenshot('spec-001-demo.png', { fullPage: true, maxDiffPixelRatio: 0.01 })`.
- **Non-régression** : aucune spécification antérieure ; la suite complète `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e` doit passer.

| Critère | Tests |
|---|---|
| CA-1 | étapes `lint`, `typecheck`, `build` de `validate.mjs` ; `tooling.test.ts` (a) |
| CA-2 | `health.test.ts` ; e2e « accueil provisoire et santé @SPEC-001 » |
| CA-3 | rapports `unit.json` et `integration.json` produits par `validate.mjs` (≥ 1 test `[SPEC-001]` chacun) |
| CA-4 | e2e `@SPEC-001` (vidéos, `e2e.json`, `e2e.xml`) |
| CA-5 | `tooling.test.ts` (b) |
| CA-6 | `sdd-pages.test.ts` ; e2e « page de démonstration SPEC-001 @SPEC-001 » ; test `@visual` |
| CA-7 | `platform.test.ts` ; `tooling.test.ts` (c) |

## 13. Preuves attendues

`evidence/SPEC-001/` : `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, `summary.md`, `acceptance.md` complété ; `video/` : au moins les vidéos « accueil provisoire et santé » et « page de démonstration SPEC-001 » ; `screenshots/` : captures finales de chaque test ; ligne de base `apps/web/e2e/__screenshots__/p0/spec-001.spec.ts/spec-001-demo-desktop-<platform>.png` commitée.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7, plus : le dépôt Git existe avec la branche `main` ; `node tools/sdd/validate.mjs SPEC-001` réussit toutes ses étapes sans `--skip-build` ; aucun fichier hors de la section 9 n'est modifié ; aucune dépendance installée hors de la section 3.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0002 (monorepo), ADR-0003 (versions), ADR-0004 (Next.js, API `/api/v1`), ADR-0047 (horloge injectable, `CLOCK_FIXED_AT`), ADR-0049 (pages de démonstration), ADR-0070 (Vitest, Playwright).
- ADR créés : **ADR-0100** (amorçage Git et identité locale de l'agent), **ADR-0101** (exécution des tests : scripts racine appelant directement Vitest et le lanceur Playwright, projets, port 3100, chemins des rapports, exemption de `tools/sdd/` pour la règle d'horloge), **ADR-0102** (pages de démonstration dans le dossier `app/%5Fdev/`, activation lue à l'exécution, coquille commune).
- ADR créés pendant l'implémentation : **ADR-0220** (lint de `tools/sdd`, exclusions Prettier, `lib/health.ts`, `globalDependencies` Turborepo), **ADR-0221** (versions compatibles retenues : TypeScript 6.0, ESLint 9, `@types/node` 24).
- Hypothèse : les paquets internes sont consommés en TypeScript source (`transpilePackages`) ; un paquet n'a une étape `build` que s'il doit être exécuté hors de Next.js (ex. worker, SPEC-007).
- Hypothèse : si Next.js ≥ 16 est la dernière version stable, les fichiers et API sont ceux de cette version (ex. `proxy.ts` remplace `middleware.ts`) ; la spécification n'utilise aucune API dépréciée.
