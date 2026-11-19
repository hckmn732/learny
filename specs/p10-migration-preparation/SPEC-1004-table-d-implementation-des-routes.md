---
id: SPEC-1004
title: Table d'implémentation des routes (@learny/api-routes)
phase: P10
priority: migration
depends_on: [SPEC-1003]
business_rules: []
screens: []
adrs: [ADR-1002, ADR-1007, ADR-0049]
visual: demo
---

# SPEC-1004 — Table d'implémentation des routes (`@learny/api-routes`)

## 1. Objectif

Faire de l'implémentation de chaque route une **donnée unique** : une table `ROUTE_IMPLEMENTATIONS` (identifiant de route → fonction qui appelle `packages/services`) et une table de gestionnaires spéciaux, dans le paquet serveur `@learny/api-routes`. Les 154 fichiers `route.ts` de Next deviennent des délégations générées d'une ligne, ce qui permettra à `apps/api` (SPEC-1101) de servir exactement le même code, sans duplication ni dérive.

## 2. Contexte

Le registre `ROUTES` de `packages/contracts/src/routes.ts` décrit chaque route (méthode, chemin `:param`, schémas, authentification, idempotence, limitation). Les fichiers `apps/web/app/api/**/route.ts` associent une route à une fonction de service : 124 font moins de 15 lignes, 28 entre 16 et 50, 2 plus de 50. Les modules d'injection `apps/web/lib/api/{resource-deps,push-deps,personal-data-deps}.ts`, `apps/web/lib/quiz-grade-registry.ts`, `apps/web/lib/health.ts`, `apps/web/lib/health-database.ts`, `apps/web/lib/email/unsubscribe-page.ts` et `apps/web/lib/supabase/server.ts` (cookies des routes d'authentification) sont du code serveur propre aux routes. `/api/inngest` sert les fonctions de `@learny/jobs`. Lire ADR-1002, ADR-1007, `docs/architecture/api.md` §1–2.

## 3. Dépendances

- **SPEC-1003** : `@learny/http` (`handler`, gardes, `configureHttp`).
- Aucune bibliothèque nouvelle.

## 4. Règles métier couvertes

Aucune règle `BR-*` ; les routes appellent les mêmes services avec les mêmes arguments.

## 5. Exigences fonctionnelles

- **EF-1** — `@learny/api-routes` exporte `ROUTE_IMPLEMENTATIONS`, typé `{ [K in keyof typeof ROUTES]: RouteImplementation<(typeof ROUTES)[K]> }` : chaque route du registre a exactement une implémentation ; une route ajoutée au registre sans implémentation est une erreur de typecheck.
- **EF-2** — `@learny/api-routes` exporte `SPECIAL_HANDLERS` pour les routes qui ne passent pas par le chemin standard : flux SSE `POST /api/v1/conversations/:id/messages`, webhook Stripe (corps brut), callback et redirections `302` de `/auth/*`, page HTML et JSON de `/email/unsubscribe`, envoi signé `POST /chapters/:cid/uploads` (idempotence portée par le service, ADR-0255), santé `/health`, routes `dev.*` protégées par la garde de développement, et `/api/inngest`. Chaque entrée déclare `method`, `path` et une fonction `(request: Request, params) => Promise<Response>`.
- **EF-3** — `node tools/migration/generate-next-routes.mjs` (re)génère l'arborescence `apps/web/app/api/**/route.ts` à partir des deux tables : un fichier par chemin (`:fid` → `[fid]`), une exportation par méthode, contenu de la forme `export const GET = nextRoute('homeGet');` plus `export const dynamic = 'force-dynamic';` et, si le fichier d'origine en déclarait, les mêmes options de segment (`runtime`, `maxDuration`).
- **EF-4** — `pnpm migration:routes:check` échoue si l'arborescence générée diffère de l'arborescence présente (dérive), si un fichier `route.ts` n'est couvert par aucune table, ou si une entrée de table n'a pas de fichier. Le script est appelé par `pnpm lint`.
- **EF-5** — Toutes les réponses de l'API sont identiques avant et après (suites d'intégration et e2e existantes inchangées).
- **EF-6** — La page `/_dev/sdd/SPEC-1004` affiche la couverture : nombre de routes du registre, d'implémentations standard, de gestionnaires spéciaux, de fichiers Next générés, et la dérive (0).

## 6. Exigences techniques

- **ET-1** — `packages/api-routes` : `src/implementations/<domaine>.ts` (un fichier par fichier de `packages/contracts/src/` qui déclare des routes), `src/index.ts` (assemble `ROUTE_IMPLEMENTATIONS`), `src/special/*.ts`, `src/deps/*.ts` (modules d'injection déplacés depuis `apps/web/lib`), `src/coverage.ts` (fonction pure `routeCoverage()` utilisée par EF-4, EF-6 et SPEC-1101).
- **ET-2** — `RouteImplementation<R> = (args: { ctx: ServiceContext; input: RouteInput<R>; request: Request }) => Promise<Result<RouteOutput<R>, AppError>>`, signature déjà attendue par `handler(route, fn)` de `@learny/http` ; si `handler()` utilise une autre forme, la table s'y aligne **sans changer** `handler()`.
- **ET-3** — `apps/web/lib/api/next-route.ts` : `nextRoute(id)` renvoie `handler(ROUTES[id], ROUTE_IMPLEMENTATIONS[id])` ; `nextSpecial(key)` renvoie le gestionnaire spécial. Ce sont les deux seuls imports des fichiers générés.
- **ET-4** — `eslint.config.mjs` : `ALLOWED_IMPORTS['api-routes'] = ['http', 'contracts', 'core', 'config', 'db', 'services', 'jobs', 'notifications', 'llm', 'tutor', 'ingestion', 'automations', 'learning-engine', 'bricks']` (sans `ui`) ; `apps/web/app/api/**` reste couvert par la liste de référence de SPEC-1001 jusqu'à SPEC-1201, mais `nextRoute`/`nextSpecial` ne doivent plus importer que `@learny/http` et `@learny/api-routes`.
- **ET-5** — Synchronisation avec `main` (ADR-1006) : quand une fusion de `main` modifie un fichier `route.ts`, l'agent reporte la modification dans `@learny/api-routes`, puis régénère ; la procédure est écrite dans `docs/engineering/git.md` (section « Piste de migration »).

## 7. Comportements attendus et cas limites

- **CL-1** — Route présente dans le registre mais absente des deux tables → typecheck en échec (standard) ou `routes:check` en échec (spéciale).
- **CL-2** — Deux entrées pour le même couple méthode + chemin → `routes:check` en échec « doublon ».
- **CL-3** — Fichier `route.ts` écrit à la main après génération → `routes:check` en échec « dérive ».
- **CL-4** — Route d'un fichier d'origine de plus de 50 lignes (logique locale) → la logique va dans l'implémentation ou dans un service existant, jamais dans le fichier généré ; si elle relevait du métier, elle va dans `packages/services` avec ses tests.
- **CL-5** — Routes `dev.*` avec `ENABLE_SDD_PAGES` absent → 404 comme aujourd'hui (garde de développement inchangée).

## 8. Instructions d'implémentation

1. Créer `packages/api-routes`, déplacer les modules d'injection (`git mv`). Commit `refactor(SPEC-1004): crée @learny/api-routes et ses dépendances injectées`.
2. Écrire les implémentations domaine par domaine en reprenant **mot pour mot** le corps des fichiers `route.ts`, un commit par lot de domaines (`refactor(SPEC-1004): décrit les routes <domaines> comme données`).
3. Écrire `SPECIAL_HANDLERS` et `routeCoverage()`. Commit `refactor(SPEC-1004): isole les gestionnaires spéciaux`.
4. Écrire `generate-next-routes.mjs`, `nextRoute`/`nextSpecial`, générer l'arborescence, brancher `migration:routes:check` dans `lint`. Commit `build(SPEC-1004): génère les routes Next depuis la table d'implémentation`.
5. Rejouer toute la suite d'intégration et e2e de l'API ; démonstration ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/api-routes/{package.json,tsconfig.json,src/index.ts,src/coverage.ts,src/implementations/*.ts,src/special/*.ts,src/deps/*.ts,src/coverage.test.ts}`, `tools/migration/generate-next-routes.mjs`, `tools/migration/test/unit/routes-check.test.ts`, `apps/web/lib/api/next-route.ts`, `apps/web/components/sdd-demos/spec-1004.tsx`, `apps/web/e2e/specs/p10/spec-1004.spec.ts`.
- **Modifiés** : les 154 `apps/web/app/api/**/route.ts` (générés), `apps/web/lib/api/{resource-deps,push-deps,personal-data-deps}.ts` (déplacés), `apps/web/lib/quiz-grade-registry.ts`, `apps/web/lib/health*.ts`, `apps/web/lib/email/unsubscribe-page.ts` (déplacés vers `packages/api-routes/src/deps` ou `special`, réexportés si des écrans les utilisent), `package.json` (scripts), `eslint.config.mjs`, `docs/engineering/git.md`, `tools/migration/web-boundary-baseline.json`, `apps/web/app/%5Fdev/sdd/registry.ts`, `pnpm-lock.yaml`.
- **Lus** : `packages/contracts/src/routes.ts`, `packages/contracts/src/define-route.ts`, `docs/architecture/api.md`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1004` : `h1` « Table des routes » ; tableau `data-testid="spec-1004-coverage"` (« Routes du registre », « Implémentations », « Gestionnaires spéciaux », « Fichiers Next générés », « Dérive ») ; liste repliable `spec-1004-special` des gestionnaires spéciaux (méthode, chemin). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Chaque route du registre a exactement une implémentation (typecheck + `routeCoverage()` = 100 %, 0 doublon).
- **CA-2** — `pnpm migration:routes:check` passe ; une modification manuelle d'un fichier généré le fait échouer.
- **CA-3** — Toutes les suites d'intégration de `apps/web/test/integration` et toute la suite e2e passent sans modification d'assertion.
- **CA-4** — Aucun fichier `route.ts` ne contient de logique : chaque fichier ne contient que des appels `nextRoute`/`nextSpecial` et des options de segment.
- **CA-5** — La page de démonstration affiche une couverture complète et une dérive nulle.

## 12. Plan de tests

- **Unitaires** — `packages/api-routes/src/coverage.test.ts`, `describe('[SPEC-1004] route coverage')` : couverture, doublons, routes spéciales déclarées (CA-1). `tools/migration/test/unit/routes-check.test.ts`, `describe('[SPEC-1004] next routes generation')` : génération sur un registre réduit, dérive détectée, fichier orphelin, contenu sans logique (CA-2, CA-4).
- **Intégration** — toutes les suites `apps/web/test/integration/*routes*.test.ts`, `api-handler`, `inngest-route`, `email-unsubscribe`, `auth-routes`, `sync-route` (inchangées) ; nouveau `apps/web/test/integration/generated-routes.test.ts`, `describe('[SPEC-1004] generated routes')` : chaque route du registre répond (≠ 404/405) au travers de Next (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p10/spec-1004.spec.ts`, `test('affiche la couverture des routes @SPEC-1004')` (CA-5), vidéo ; suite e2e complète en non-régression (CA-3).
- **Visuel** — `test('démonstration de la table des routes @SPEC-1004 @visual')` (CA-5).
- **Non-régression** — suite e2e complète (`pnpm test:e2e`), `[SPEC-201]`, `[SPEC-203]`, `[SPEC-610]`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire couverture ; typecheck |
| CA-2 | unitaire génération |
| CA-3 | intégration ; e2e complète |
| CA-4 | unitaire génération |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1004/` : rapports, vidéo, captures, sortie de `migration:routes:check`, rapport de la suite e2e complète, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : suite e2e **complète** verte (pas seulement `@SPEC-1004`), car la spécification touche toutes les routes.

## 15. Décisions et hypothèses

ADR-1002, ADR-1007. Décision : les fichiers Next sont générés pour éliminer toute dérive pendant la cohabitation avec `main` ; ils disparaissent avec SPEC-1201. Aucune question ouverte.
