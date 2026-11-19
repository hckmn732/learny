---
id: SPEC-1103
title: Absorption du worker, images, CI et déploiement de l'API
phase: P11
priority: migration
depends_on: [SPEC-1102]
business_rules: []
screens: []
adrs: [ADR-0337, ADR-0017, ADR-0329, ADR-0330, ADR-0341]
visual: demo
---

# SPEC-1103 — Absorption du worker, images, CI et déploiement de l'API

## 1. Objectif

Faire de `apps/api` le seul processus backend livrable : il absorbe `apps/worker`, dispose de son image Docker, est construit et testé par la CI, et se déploie dans chaque environnement (local Docker, auto-hébergé, Coolify QA, prévisualisation et production gérées) **à côté** du web, sans que le web ne l'utilise encore pour ses écrans.

## 2. Contexte

ADR-0337 §4–5 : `LEARNY_API_ROLE` (`all`, `api`, `jobs`), image `docker/api.Dockerfile`, projet Vercel `learny-api` en `fra1`. Existant : `apps/worker` (Hono, `/api/inngest`, santé, Sentry), `docker/worker.Dockerfile`, `docker/healthcheck-worker.mjs`, `docker/compose.{dev,selfhost,coolify,coolify-qa}.yml` (ADR-0329, ADR-0330), `.github/workflows/{ci,deploy}.yml`, `tools/deploy/check.mjs`, `tools/docker/check-selfhost.mjs`, `vercel.json`. SPEC-1001 a interdit tout déploiement depuis la piste : cette spécification réactive la prévisualisation pour la branche `migration` une fois les deux applications déployables ensemble. Lire ADR-0337, ADR-0329, ADR-0330, `docs/architecture/overview.md` §6.

## 3. Dépendances

- **SPEC-1102** : configuration `API_PROXY_SECRET`, `API_INTERNAL_URL`.
- Services : Docker, Coolify (QA), Vercel (prévisualisation/production). Sans jeton Vercel ou Coolify dans l'environnement de l'agent, les fichiers et contrôles statiques sont livrés et le déploiement réel est consigné par `node tools/sdd/fail.mjs SPEC-1103 "…" --external` seulement si un critère l'exige ; les critères ci-dessous sont vérifiables hors ligne.

## 4. Règles métier couvertes

Aucune règle `BR-*`.

## 5. Exigences fonctionnelles

- **EF-1** — `apps/worker` est supprimé ; ses tests (santé, Sentry, rapporteur) sont portés dans `apps/api`. `apps/api` avec `LEARNY_API_ROLE=jobs` ne sert que `/health` et `/api/inngest` ; avec `api`, tout sauf `/api/inngest` ; avec `all` (défaut), tout.
- **EF-2** — `docker/api.Dockerfile` construit une image Node 24 non root, `HEALTHCHECK` par `docker/healthcheck-api.mjs` (`GET /health` = `ok`), port 3001.
- **EF-3** — Les fichiers compose remplacent le service `worker` par `api` (même variables Inngest, plus `API_PROXY_SECRET`, `SUPABASE_*`, `APP_ENCRYPTION_KEY` et les secrets serveur nécessaires aux routes) ; le service `web` reçoit `API_INTERNAL_URL=http://api:3001` et `API_PROXY_SECRET`. Inngest est configuré pour appeler `http://api:3001/api/inngest`.
- **EF-4** — La CI construit, analyse (lint, typecheck) et teste `apps/api`, construit l'image `api` et exécute `tools/docker/check-selfhost.mjs` mis à jour.
- **EF-5** — `deploy.yml` : déploie `learny-api` **avant** `learny-web` (prévisualisation et production), transmet `API_INTERNAL_URL` du déploiement API au déploiement web ; la prévisualisation est réactivée pour `migration` ; la production reste limitée aux tags `v*` de `main` (inchangé).
- **EF-6** — `tools/deploy/check.mjs` vérifie `apps/api/vercel.json` (région `fra1` unique, comme le web) et la présence de `API_INTERNAL_URL` et `API_PROXY_SECRET` dans les environnements gérés.
- **EF-7** — La page `/_dev/sdd/SPEC-1103` affiche la topologie lue dans les fichiers compose (services et dépendances), le rôle courant de l'API, la liste des fonctions Inngest servies et la santé de l'API.

## 6. Exigences techniques

- **ET-1** — `apps/api/src/server.ts` lit `LEARNY_API_ROLE` via `@learny/config` (énumération, défaut `all`) ; `createApp({ role })` monte les sous-ensembles correspondants.
- **ET-2** — `apps/api/vercel.json` : `regions: ["fra1"]`, fonction Node unique (adaptateur `hono/vercel`), durée maximale identique à celle des routes IA du web ; `apps/api/api/index.ts` comme point d'entrée Vercel.
- **ET-3** — `docker/api.Dockerfile` : construction multi-étapes reprenant `worker.Dockerfile` (pnpm `--filter @learny/api... deploy`), `USER node`, `NODE_ENV=production`.
- **ET-4** — Les scripts racine `dev:worker` et `test` qui référencent `@learny/worker` pointent vers `@learny/api` ; `turbo.json` et `pnpm-workspace.yaml` n'ont plus d'entrée `worker`.
- **ET-5** — `docs/architecture/overview.md` §2 et §6 décrivent la nouvelle topologie et le tableau des environnements (colonne « API »).

## 7. Comportements attendus et cas limites

- **CL-1** — `LEARNY_API_ROLE` invalide → démarrage refusé avec message listant les valeurs permises.
- **CL-2** — `API_PROXY_SECRET` absent en production → démarrage refusé (web et API).
- **CL-3** — API indisponible pendant le déploiement du web → le web de cette spécification n'en dépend que pour les pages `/_dev` ; les écrans produit restent servis.
- **CL-4** — Prévisualisation de la branche `migration` sans projet Vercel `learny-api` configuré → l'étape échoue avec un message explicite, sans déployer le web à moitié configuré.
- **CL-5** — Compose auto-hébergé : `web` démarre après la santé de `api` (`depends_on: condition: service_healthy`).

## 8. Instructions d'implémentation

1. Rôles dans `apps/api`, portage des tests du worker, suppression de `apps/worker`. Commit `refactor(SPEC-1103): absorbe le worker dans apps/api`.
2. `docker/api.Dockerfile`, healthcheck, compose (dev, selfhost, coolify, coolify-qa), `check-selfhost.mjs`. Commit `build(SPEC-1103): construit et compose l'image de l'API`.
3. CI et déploiement (`ci.yml`, `deploy.yml`, `apps/api/vercel.json`, `tools/deploy/check.mjs`), réactivation de la prévisualisation. Commit `ci(SPEC-1103): déploie l'API avant le web`.
4. Documentation, démonstration, e2e, visuel. `validate.mjs`, `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `docker/api.Dockerfile`, `docker/api.Dockerfile.dockerignore`, `docker/healthcheck-api.mjs`, `apps/api/vercel.json`, `apps/api/api/index.ts`, `apps/api/test/integration/roles.test.ts`, `apps/web/components/sdd-demos/spec-1103.tsx`, `apps/web/e2e/specs/p11/spec-1103.spec.ts`.
- **Supprimés** : `apps/worker/**`, `docker/worker.Dockerfile`, `docker/healthcheck-worker.mjs`.
- **Modifiés** : `docker/compose.dev.yml`, `docker/compose.selfhost.yml`, `docker/compose.coolify.yml`, `docker/compose.coolify-qa.yml`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `tools/deploy/check.mjs` et tests, `tools/docker/check-selfhost.mjs` et tests, `tools/dev/up.mjs` (si le worker y est démarré), `package.json`, `turbo.json`, `packages/config/src/server.ts`, `.env.example`, `docs/architecture/overview.md`, `README.md`, `apps/web/app/%5Fdev/sdd/registry.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1103` : `h1` « Déploiement de l'API » ; liste `data-testid="spec-1103-topology"` (services compose et dépendances) ; carte `spec-1103-role` (Rôle, Santé) ; liste `spec-1103-functions` (identifiants des fonctions Inngest). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Le dépôt ne contient plus `apps/worker` ; les tests portés passent ; les trois rôles servent exactement les sous-ensembles d'EF-1.
- **CA-2** — L'image `api` se construit et son `HEALTHCHECK` passe dans `docker compose -f docker/compose.selfhost.yml up` (contrôle `pnpm docker:check:selfhost`).
- **CA-3** — `node tools/ci/check-workflows.mjs` et `node tools/deploy/check.mjs --dry-run` passent ; le flux de déploiement ordonne API puis web.
- **CA-4** — Aucun secret n'est présent dans les fichiers compose, Dockerfile ou workflows (contrôle `secret-patterns`).
- **CA-5** — La démonstration affiche la topologie, le rôle `all`, les fonctions Inngest et une santé `ok`.

## 12. Plan de tests

- **Unitaires** — `tools/docker/*.test.ts` et `tools/deploy/*.test.ts` étiquetés `[SPEC-1103]` : compose (services, dépendances, variables), région, ordre de déploiement, prévisualisation de `migration` (CA-2, CA-3, CA-4).
- **Intégration** — `apps/api/test/integration/roles.test.ts`, `describe('[SPEC-1103] api roles')` : sous-ensembles servis par rôle (CA-1) ; tests portés du worker étiquetés `[SPEC-1103]`.
- **End-to-end** — `apps/web/e2e/specs/p11/spec-1103.spec.ts`, `test('affiche la topologie de déploiement @SPEC-1103')` (CA-5), vidéo.
- **Visuel** — `test('démonstration du déploiement @SPEC-1103 @visual')` (CA-5).
- **Non-régression** — `@SPEC-007`, `[SPEC-012]`, `[SPEC-013]`, `@SPEC-203`.

| Critère | Tests |
|---|---|
| CA-1 | intégration rôles |
| CA-2 | unitaire compose ; contrôle auto-hébergé |
| CA-3 | unitaire workflows et déploiement |
| CA-4 | unitaire secrets |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1103/` : rapports, vidéo, captures, sortie de `docker:check:selfhost`, sortie de `deploy:check --dry-run`, `checks.json`, `acceptance.md`. Si un déploiement réel a été possible : URL de prévisualisation de l'API et réponse de `/health`.

## 14. Définition de terminé

Conditions communes, plus : un environnement auto-hébergé se lance avec `api` et `web` et les jobs de démonstration (`@SPEC-203`) passent au travers de `apps/api`.

## 15. Décisions et hypothèses

ADR-0337 (rôles, image, projet Vercel), ADR-0017 amendé, ADR-0329/0330 (piles Coolify). Hypothèse : les secrets des environnements gérés sont ajoutés par le porteur du projet ; leur absence est un blocage externe, jamais contourné. Aucune question ouverte.
