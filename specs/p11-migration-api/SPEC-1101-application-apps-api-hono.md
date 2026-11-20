---
id: SPEC-1101
title: Application apps/api (Hono) servant toutes les routes
phase: P11
priority: migration
depends_on: [SPEC-1004, SPEC-1002]
business_rules: []
screens: []
adrs: [ADR-1002, ADR-1001, ADR-0017, ADR-0049]
visual: demo
---

# SPEC-1101 — Application `apps/api` (Hono) servant toutes les routes

## 1. Objectif

Créer le backend autonome `apps/api` : un serveur Hono qui monte toutes les routes de `ROUTE_IMPLEMENTATIONS` et de `SPECIAL_HANDLERS` (SPEC-1004) au travers de `@learny/http` (SPEC-1003), sert `/api/inngest`, et répond **exactement** comme les routes Next actuelles. Le web n'est pas encore branché dessus : la parité est prouvée par des tests qui interrogent les deux hôtes.

## 2. Contexte

ADR-1002 : Hono 4, port local 3001, absorption future du worker (SPEC-1103). ADR-0017 amendé : `/api/inngest` servi par `apps/api`. `application Worker historique/src/server.ts` montre déjà l'usage de `@hono/node-server`, `inngest/hono`, Sentry Node et la santé `{ status, version, commit }`. `apps/web/server.mjs` montre les délais de connexion à reprendre (keep-alive 65 s). Lire ADR-1002, `docs/architecture/api.md`, `docs/engineering/testing.md` §3–4, `apps/web/playwright.config.ts` (`webServer`), `packages/config/src/server.ts`.

## 3. Dépendances

- **SPEC-1004** : `ROUTE_IMPLEMENTATIONS`, `SPECIAL_HANDLERS`, `routeCoverage()`.
- **SPEC-1002** : `@learny/api-client` (utilisé par la démonstration et les tests de parité).
- Bibliothèques : `hono` 4 et `@hono/node-server` (versions de `application Worker historique`), `inngest` (version de `packages/jobs`), `@sentry/node`.
- Services locaux : Supabase CLI et Inngest Dev Server comme pour le web ; sans Inngest Dev Server, `/api/inngest` répond selon le protocole et les tests directs restent possibles (comportement SPEC-007).

## 4. Règles métier couvertes

Aucune règle `BR-*` ; mêmes services, mêmes contrats.

## 5. Exigences fonctionnelles

- **EF-1** — `apps/api` démarre sur `PORT` (défaut 3001) et sert : toutes les routes du registre sous `/api/v1`, les gestionnaires spéciaux, `/api/inngest`, `GET /health` (forme du worker : `status`, `version`, `commit`). Les chemins, méthodes, statuts, corps et en-têtes sont identiques à ceux de `apps/web`.
- **EF-2** — Le flux SSE du tuteur est transmis au fil de l'eau (premier fragment reçu avant la fin de la génération simulée) avec les en-têtes `content-type: text/event-stream; charset=utf-8` et `x-vercel-ai-ui-message-stream: v1`.
- **EF-3** — `pnpm dev` démarre le web **et** l'API ; `pnpm --filter @learny/api dev|build|start|lint|typecheck` fonctionnent ; `turbo.json` connaît `apps/api`.
- **EF-4** — Playwright démarre deux serveurs : le web (inchangé) et l'API sur `PLAYWRIGHT_PORT + 1` ; `API_INTERNAL_URL` est transmis au web de test.
- **EF-5** — La page `/_dev/sdd/SPEC-1101` interroge `apps/api` côté serveur (`API_INTERNAL_URL`) et affiche : santé de l'API (statut, version), couverture des routes servies (`routeCoverage()` exposé par `GET /api/v1/dev/sdd/api/coverage`, garde de développement), et une comparaison « web / api » de `GET /api/v1/health` (corps identiques : oui/non).

## 6. Exigences techniques

- **ET-1** — `apps/api/src/app.ts` : `createApp(options) → Hono`, sans effet de bord ; `apps/api/src/server.ts` : configuration (`parseServerEnv`), `configureHttp(...)` (mêmes protections que le web), Sentry, `createAdaptorServer`, `keepAliveTimeout = 65_000`, `headersTimeout = 66_000`, arrêt propre sur `SIGTERM`/`SIGINT`.
- **ET-2** — Montage générique : pour chaque entrée de `ROUTES`, `app.on(route.method, route.path, (c) => handler(route, ROUTE_IMPLEMENTATIONS[id])(c.req.raw, { params: Promise.resolve(c.req.param()) }))` ; idem pour `SPECIAL_HANDLERS`. Le webhook Stripe lit le corps brut depuis `c.req.raw` (aucun middleware de corps Hono avant lui).
- **ET-3** — `/api/inngest` : `serve({ client: inngest, functions })` de `inngest/hono` avec les fonctions de `@learny/jobs`, plus l'enregistrement des tâches en ligne (`registerInlineJobs`, déplacé en SPEC-1004).
- **ET-4** — `@learny/config` : variable serveur `API_INTERNAL_URL` (URL, défaut `http://127.0.0.1:3001` hors production, obligatoire en production) et `API_PORT` (défaut 3001) ; documentées dans `.env.example`.
- **ET-5** — Harnais de test `packages/testing/src/api.ts` : `requestApi(target: 'next' | 'hono', init)` ; pour `hono`, `createApp(testOptions).request(...)` ; pour `next`, le chemin actuel. Les 9 fichiers qui utilisent `next-test-api-route-handler` sont paramétrés `describe.each(['next', 'hono'])` sans modification d'assertion.
- **ET-6** — Test de couverture HTTP : pour chaque route du registre, `createApp().request(method, path factice)` ne renvoie ni 404 ni 405 ; une route `auth: 'user'` sans session renvoie 401 `problem+json`.
- **ET-7** — `eslint.config.mjs` : `apps/api` peut importer tous les paquets sauf `ui`, `bricks/view`, `api-client` côté serveur n'est pas nécessaire ; `apps/api` n'importe jamais `apps/*`.

## 7. Comportements attendus et cas limites

- **CL-1** — Route inconnue → 404 `problem+json` `NOT_FOUND` avec `requestId` (même forme que Next).
- **CL-2** — Méthode non prise en charge sur un chemin connu → 405 avec en-tête `Allow`, comme Next.
- **CL-3** — Corps de plus de 1 Mo sur une route JSON → même refus qu'aujourd'hui (la limite applicable est vérifiée et reproduite).
- **CL-4** — Client qui coupe le flux SSE → la génération est annulée côté service comme aujourd'hui (signal d'abandon propagé depuis `c.req.raw.signal`).
- **CL-5** — Base indisponible → `/health` répond comme le web (statut dégradé), le processus ne s'arrête pas.
- **CL-6** — `PORT` occupé → sortie avec erreur lisible, code 1.

## 8. Instructions d'implémentation

1. Créer `apps/api` (package, tsconfig, `build.mjs` esbuild calqué sur `application Worker historique`), `createApp`, santé. Commit `feat(SPEC-1101): crée l'application apps/api`.
2. Montage générique des routes standard et spéciales, `/api/inngest`. Commit `feat(SPEC-1101): sert toutes les routes du registre`.
3. Configuration (`API_INTERNAL_URL`, `API_PORT`), scripts, Turbo, `pnpm dev`. Commit `build(SPEC-1101): intègre apps/api au monorepo`.
4. Harnais `requestApi`, paramétrage des 9 suites, test de couverture HTTP, test SSE. Commit `test(SPEC-1101): prouve la parité Next et Hono`.
5. Playwright à deux serveurs, route `dev.sdd.api.coverage`, démonstration, e2e, visuel. `validate.mjs`, `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/api/{package.json,tsconfig.json,build.mjs,src/app.ts,src/server.ts,src/sentry.ts,src/mount.ts,test/integration/coverage.test.ts,test/integration/sse.test.ts,test/integration/health.test.ts}`, `packages/testing/src/api.ts`, `packages/contracts/src/dev-migration.ts` (route `dev.sddApiCoverage`), `apps/web/components/sdd-demos/spec-1101.tsx`, `apps/web/e2e/specs/p11/spec-1101.spec.ts`.
- **Modifiés** : `packages/contracts/src/routes.ts` (inscription de la route de démonstration), `packages/api-routes/src/implementations/dev.ts`, `packages/config/src/server.ts`, `.env.example`, `package.json` (`dev`), `turbo.json`, `pnpm-workspace.yaml` (inchangé si `apps/*`), `apps/web/playwright.config.ts`, les 9 suites `apps/web/test/integration/*` qui utilisent `next-test-api-route-handler`, `vitest.config.ts` (inclure `apps/api/test/**`), `eslint.config.mjs`, `docs/architecture/api.md` (inventaire : route de démonstration), `apps/web/app/%5Fdev/sdd/registry.ts`, `pnpm-lock.yaml`.
- **Lus** : `application Worker historique/src/*`, `apps/web/server.mjs`, `packages/jobs/src/index.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1101` : `h1` « API autonome » ; carte `data-testid="spec-1101-health"` (Statut, Version, Commit) ; tableau `spec-1101-coverage` (« Routes du registre », « Routes servies par l'API », « Gestionnaires spéciaux ») ; carte `spec-1101-parity` (« GET /api/v1/health — web et API identiques : Oui »). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 % (version et commit masqués).

## 11. Critères d'acceptation

- **CA-1** — 100 % des routes du registre et des gestionnaires spéciaux sont servis par `apps/api` (ni 404 ni 405).
- **CA-2** — Les 9 suites paramétrées passent pour `next` **et** `hono` avec les mêmes assertions.
- **CA-3** — Le flux SSE du tuteur arrive par fragments au travers de `apps/api` (au moins deux fragments reçus avant la fin, horodatages distincts).
- **CA-4** — `/api/inngest` de `apps/api` enregistre les mêmes fonctions que celui du web (même liste d'identifiants).
- **CA-5** — La démonstration affiche une santé `ok`, une couverture complète et la parité « Oui ».

## 12. Plan de tests

- **Unitaires** — `apps/api/src/mount.test.ts`, `describe('[SPEC-1101] mount')` : traduction des chemins, méthodes, paramètres et 405 (CA-1).
- **Intégration** — `apps/api/test/integration/coverage.test.ts`, `describe('[SPEC-1101] http coverage')` (CA-1) ; `sse.test.ts`, `describe('[SPEC-1101] tutor stream')` (CA-3) ; `health.test.ts`, `describe('[SPEC-1101] health and inngest')` (CA-4) ; suites paramétrées étiquetées `[SPEC-1101]` en plus de leur étiquette d'origine (CA-2).
- **End-to-end** — `apps/web/e2e/specs/p11/spec-1101.spec.ts`, `test('montre la santé et la parité de l API @SPEC-1101')` (CA-5), vidéo.
- **Visuel** — `test('démonstration de l API autonome @SPEC-1101 @visual')` (CA-5).
- **Non-régression** — suite d'intégration complète, `@SPEC-610`, `@SPEC-203`, `@SPEC-007`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire montage ; intégration couverture |
| CA-2 | suites paramétrées |
| CA-3 | intégration SSE |
| CA-4 | intégration santé et Inngest |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1101/` : rapports, vidéo, captures, tableau de couverture HTTP, journal du flux SSE horodaté, liste des fonctions Inngest des deux hôtes, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : `apps/web` n'appelle pas encore `apps/api` en dehors de la page de démonstration ; aucun comportement du web ne change.

## 15. Décisions et hypothèses

ADR-1002 (Hono, port 3001), ADR-0017 amendé. Décision : la parité est prouvée par paramétrage des suites existantes plutôt que par des tests nouveaux, pour ne pas dupliquer les attentes. Aucune question ouverte.
