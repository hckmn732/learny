---
id: SPEC-1003
title: Couche HTTP indépendante du framework (@learny/http)
phase: P10
priority: migration
depends_on: [SPEC-1001]
business_rules: []
screens: []
adrs: [ADR-0337, ADR-0342, ADR-0251, ADR-0258, ADR-0120]
visual: demo
---

# SPEC-1003 — Couche HTTP indépendante du framework (`@learny/http`)

## 1. Objectif

Sortir de `apps/web/lib/api/` toute la couche de transport de l'API (wrapper `handler()`, validation, idempotence, limitation de débit, garde d'origine, session, `problem+json`, identifiant de requête, garde des routes de développement) vers un paquet serveur `@learny/http` qui ne dépend que des objets standard `Request` et `Response`. Les routes Next continuent de l'utiliser à l'identique ; `apps/api` (SPEC-1101) l'utilisera ensuite.

## 2. Contexte

ADR-0337 choisit Hono et impose une couche de transport indépendante du framework ; ADR-0342 la nomme `@learny/http`. La couche existante (ADR-0251, ADR-0258, ADR-0120) est dans `apps/web/lib/api/` : `handler.ts`, `route-handler.ts`, `problem.ts`, `validate.ts`, `idempotency.ts`, `rate-limit.ts`, `origin.ts`, `request-id.ts`, `session.ts`, `bootstrap-security.ts`, `dev-guard.ts`. `NextRequest` n'y est utilisé que comme **type** (`handler.ts`, `route-handler.ts`, `dev-guard.ts`). Les routes importent `lib/api/handler` (148 fois), `lib/api/dev-guard` (23), `lib/api/idempotency` (4), `lib/api/request-id` (1). Lire `docs/architecture/api.md` §1 et les fichiers cités.

## 3. Dépendances

- **SPEC-1001** : liste de référence (les modules déplacés en sortent).
- Bibliothèques déjà présentes : `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `@sentry/core` via le rapporteur injecté (aucun SDK Sentry propre à Next dans le paquet).

## 4. Règles métier couvertes

Aucune règle `BR-*`. Les protections (limitation, idempotence, origine, acceptation légale) gardent exactement leurs règles (ADR-0120, ADR-0258, SPEC-806).

## 5. Exigences fonctionnelles

- **EF-1** — Toute réponse de l'API (corps, statut, en-têtes `Content-Type`, `X-Request-Id`, `RateLimit-*`, `Retry-After`, `Server-Timing`, `Cache-Control`) est identique avant et après le déplacement pour les suites d'intégration existantes.
- **EF-2** — `handler(route, fn, options?)` de `@learny/http` renvoie une fonction `(request: Request, segment: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>`, compatible telle quelle avec les route handlers Next et adaptable à Hono.
- **EF-3** — Les modules de `apps/web/lib/api/` déplacés deviennent des réexportations d'une ligne (`export * from '@learny/http/…'`) le temps de la transition ; aucun fichier de route n'est modifié dans cette spécification.
- **EF-4** — La page `/_dev/sdd/SPEC-1003` exécute trois requêtes réelles contre `POST /api/v1/dev/sdd/echo` (route existante `dev.echo`, authentifiée : la page utilise la session de démonstration de l'environnement SDD) : valide (200), invalide (400 `VALIDATION_FAILED`), sans `Idempotency-Key` si exigée (400) ; elle affiche statut, `code` et présence de `X-Request-Id`, et indique la provenance « @learny/http ».

## 6. Exigences techniques

- **ET-1** — `packages/http` : `package.json` avec `exports` `.`, `./handler`, `./problem`, `./validate`, `./idempotency`, `./rate-limit`, `./origin`, `./request-id`, `./session`, `./security`, `./dev-guard` ; dépendances `@learny/contracts`, `@learny/core`, `@learny/config`, `@learny/db` (idempotence et limitation persistées), `@learny/services` (gardes et contexte de service), `@supabase/ssr`, `@supabase/supabase-js`, `zod`.
- **ET-2** — Aucun import de `next` ni `next/*` dans `packages/http` (règle ESLint `no-restricted-imports` sur `packages/http/**`, et test qui parcourt les sources).
- **ET-3** — Les types `NextRequest` sont remplacés par `Request` ; tout accès éventuel à `request.nextUrl` est remplacé par `new URL(request.url)` ; les cookies sont lus depuis l'en-tête `cookie` (`parseCookieHeader`) comme le fait déjà `session.ts`.
- **ET-4** — L'enregistrement des protections (`registerSecurity()`), du rapporteur d'erreurs et des tâches en ligne (`registerInlineJobs()` de `apps/web/lib/quiz-grade-registry.ts`) devient **explicite** : `@learny/http` expose `configureHttp({ reporter, rateLimiter, originGuard, onBoot })` ; `apps/web/lib/api/handler.ts` l'appelle une fois au chargement, avec les mêmes implémentations qu'aujourd'hui. Aucun effet de bord à l'import de `@learny/http`.
- **ET-5** — `eslint.config.mjs` : `ALLOWED_IMPORTS.http = ['contracts', 'core', 'config', 'db', 'services']` ; `SERVICE_DB_ALLOWED` remplace `apps/web/lib/api/idempotency.ts` par `packages/http/src/idempotency.ts`.
- **ET-6** — Les tests unitaires de `lib/api` (`request-id.test.ts`, `validate.test.ts`) sont déplacés dans `packages/http/src/` ; les tests d'intégration de `apps/web/test/integration` (`api-handler`, `rate-limit`, `security-headers`, `observability`, `public-routes`) restent en place et passent sans modification d'assertion.

## 7. Comportements attendus et cas limites

- **CL-1** — Route appelée avant `configureHttp` (test isolé) → les implémentations « noop » actuelles s'appliquent, comme aujourd'hui avant `registerSecurity()`.
- **CL-2** — Double appel de `configureHttp` → la seconde configuration remplace la première (les tests restaurent les protections comme aujourd'hui).
- **CL-3** — Paramètre de chemin répété (`string[]`) → même validation Zod qu'aujourd'hui.
- **CL-4** — Erreur inattendue dans un service → 500 `problem+json` avec `requestId`, rapportée au rapporteur injecté une seule fois.
- **CL-5** — Corps JSON invalide → 400 `VALIDATION_FAILED` identique.

## 8. Instructions d'implémentation

1. Créer `packages/http`, `git mv` des modules de `apps/web/lib/api/` (sauf `*-deps.ts`, propres aux routes, traités par SPEC-1004), remplacer les types Next. Commit `refactor(SPEC-1003): déplace la couche de transport dans @learny/http`.
2. Rendre la configuration explicite (`configureHttp`), câbler `apps/web/lib/api/handler.ts`. Commit `refactor(SPEC-1003): configure explicitement les protections de l'API`.
3. Réexportations dans `apps/web/lib/api/`, règles ESLint, mise à jour de la liste de référence. Commit `build(SPEC-1003): interdit next dans la couche HTTP`.
4. Tests unitaires du paquet sans Next (requêtes `new Request(...)`), démonstration, e2e, visuel. `validate.mjs`, `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/http/{package.json,tsconfig.json,src/index.ts,src/configure.ts,src/handler.test.ts}` et les modules déplacés `packages/http/src/{handler,route-handler,problem,validate,idempotency,rate-limit,origin,request-id,session,security,dev-guard}.ts`, `apps/web/components/sdd-demos/spec-1003.tsx`, `apps/web/e2e/specs/p10/spec-1003.spec.ts`.
- **Modifiés** : `apps/web/lib/api/*.ts` (réexportations), `apps/web/package.json`, `eslint.config.mjs`, `tools/migration/web-boundary-baseline.json`, `vitest.config.ts`, `pnpm-lock.yaml`, `apps/web/app/%5Fdev/sdd/registry.ts`.
- **Lus** : `packages/contracts/src/define-route.ts`, `packages/services/src/security/*`, `apps/web/lib/quiz-grade-registry.ts`, `apps/web/lib/sentry.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1003` : `h1` « Couche HTTP » ; mention `data-testid="spec-1003-origin"` « Transport : @learny/http » ; tableau `spec-1003-cases` (« Cas », « Statut », « Code », « X-Request-Id ») rempli par trois boutons ou par un bouton « Exécuter les cas ». Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 % (identifiants de requête masqués).

## 11. Critères d'acceptation

- **CA-1** — `packages/http` ne contient aucun import de `next` (test et lint).
- **CA-2** — Les suites d'intégration de l'API existantes passent sans modification d'assertion.
- **CA-3** — `handler()` appelé avec un `Request` standard, hors de tout serveur, renvoie la même réponse `problem+json` qu'au travers de Next (test unitaire comparatif sur `dev.echo`).
- **CA-4** — Importer `@learny/http` n'enregistre aucune protection ; `configureHttp` les enregistre (test).
- **CA-5** — La démonstration affiche les trois cas avec les statuts 200, 400, 400 et un `X-Request-Id` présent.

## 12. Plan de tests

- **Unitaires** — `packages/http/src/handler.test.ts`, `describe('[SPEC-1003] framework-free handler')` : requête standard, validation, `problem+json`, `X-Request-Id`, absence d'effet de bord à l'import (CA-3, CA-4) ; `packages/http/src/no-next.test.ts`, `describe('[SPEC-1003] no next import')` (CA-1).
- **Intégration** — `apps/web/test/integration/http-parity.test.ts`, `describe('[SPEC-1003] parity')` : rejoue les cas de `api-handler.test.ts` via `@learny/http` direct et via la route Next, compare statut, corps et en-têtes (CA-2, CA-3). Suites existantes inchangées (CA-2).
- **End-to-end** — `apps/web/e2e/specs/p10/spec-1003.spec.ts`, `test('exécute les cas de transport @SPEC-1003')` (CA-5), vidéo.
- **Visuel** — `test('démonstration de la couche HTTP @SPEC-1003 @visual')` (CA-5).
- **Non-régression** — `[SPEC-201]`, `[SPEC-208]`, `[SPEC-010]`, `@SPEC-805`, `@SPEC-806`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire sans next ; lint |
| CA-2 | intégration parité ; suites existantes |
| CA-3 | unitaire ; intégration parité |
| CA-4 | unitaire |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1003/` : rapports, vidéo, captures, sortie du test de parité (table des réponses comparées), `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : aucun fichier `route.ts` modifié, aucune assertion de test existante modifiée.

## 15. Décisions et hypothèses

ADR-0337 (transport indépendant), ADR-0342 (nom et dépendances). Décision : la configuration explicite `configureHttp` remplace les effets de bord à l'import, condition pour que deux hôtes (Next puis Hono) configurent le même paquet. Aucune question ouverte.
