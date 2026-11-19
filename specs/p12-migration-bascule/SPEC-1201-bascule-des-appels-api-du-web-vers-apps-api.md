---
id: SPEC-1201
title: Bascule des appels /api du web vers apps/api
phase: P12
priority: migration
depends_on: [SPEC-1103]
business_rules: []
screens: []
adrs: [ADR-1003, ADR-1005, ADR-1002, ADR-0252]
visual: demo
---

# SPEC-1201 — Bascule des appels `/api` du web vers `apps/api`

## 1. Objectif

Faire servir **tout** le trafic `/api/*` du web par `apps/api` : `apps/web` relaie ces requêtes vers `API_INTERNAL_URL` sur la même origine (aucun changement pour le navigateur, aucun CORS), puis les 154 fichiers `route.ts` de Next et l'adaptateur Next de `@learny/http` sont supprimés. La suite e2e complète, inchangée, prouve la parité.

## 2. Contexte

Phase P12, débloquée après CP-11 **et** CP-8 (V1 livrée, ADR-1006 §5). ADR-1003 §3 : même origine, relai `afterFiles`. ADR-1005 §4–5 : le relai ajoute `X-Learny-Proxy-Secret`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`. Comme les réécritures déclaratives de Next ne peuvent pas ajouter d'en-tête à la requête relayée, le relai est fait par `proxy.ts` (`NextResponse.rewrite(url, { request: { headers } })`), qui s'exécute déjà pour toutes les requêtes. Points à risque identifiés : flux SSE du tuteur, cookies posés par `/auth/*`, corps brut du webhook Stripe, taille des corps relayés, garde d'origine. Lire ADR-1003, ADR-1005, ADR-0252, `apps/web/proxy.ts`, `apps/web/next.config.ts`, `docs/engineering/testing.md` §4.

## 3. Dépendances

- **SPEC-1103** : `apps/api` livrable, proxy de confiance (SPEC-1102), Playwright à deux serveurs (SPEC-1101).
- **CP-8** réussi (exigé par la phase).

## 4. Règles métier couvertes

Aucune règle `BR-*` ; aucun comportement modifié.

## 5. Exigences fonctionnelles

- **EF-1** — Toute requête du navigateur vers `/api/v1/*`, `/api/inngest` et `/openapi.json` du web est servie par `apps/api` avec la même réponse qu'avant (statut, corps, en-têtes, cookies).
- **EF-2** — Le flux SSE du tuteur arrive au navigateur par fragments, sans mise en mémoire tampon complète par le relai.
- **EF-3** — `Set-Cookie` émis par `/api/v1/auth/*` atteint le navigateur avec les mêmes attributs (domaine du web, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en HTTPS).
- **EF-4** — Le webhook Stripe reçu par le web (`/api/v1/webhooks/stripe`) est vérifié par `apps/api` sur le corps brut identique (signature valide acceptée, altérée refusée 400 `INVALID_SIGNATURE`).
- **EF-5** — `apps/web/app/api/**` n'existe plus ; `apps/web/lib/api/` ne contient plus que le relai ; `next-test-api-route-handler` est retiré ; les suites d'intégration de routes sont déplacées dans `apps/api/test/integration/` et ne ciblent plus que `hono`.
- **EF-6** — `apps/api` sert le document OpenAPI à `/openapi.json` et `/api/v1/openapi.json` ; `pnpm openapi:generate|check` écrivent et contrôlent `apps/api/openapi.json`.
- **EF-7** — La page `/_dev/sdd/SPEC-1201` appelle `GET /api/v1/health` **par l'origine du web** et affiche l'en-tête `X-Served-By` reçu (`learny-api`), le temps de relai mesuré et un test SSE (nombre de fragments reçus avant la fin).

## 6. Exigences techniques

- **ET-1** — `apps/web/lib/api/relay.ts` : `relayToApi(request) → NextResponse` ; appelé en tête de `proxy.ts` pour les chemins `/api/` et `/openapi.json`, avant toute autre logique (pas de rafraîchissement de session sur ces chemins, comme aujourd'hui pour `isApiPath`). Il copie la requête vers `new URL(pathname + search, API_INTERNAL_URL)` et ajoute les en-têtes d'ADR-1005 ; il retire tout `X-Learny-Proxy-Secret` entrant.
- **ET-2** — `apps/api` ajoute `X-Served-By: learny-api` à toutes ses réponses (en-tête purement technique).
- **ET-3** — `next.config.ts` : limite de corps relayé portée à 12 Mo si la limite par défaut du proxy Next est inférieure (vérifiée sur la version installée), afin de ne refuser aucune requête acceptée aujourd'hui ; documentée dans le code.
- **ET-4** — `packages/contracts/scripts/generate-openapi.ts` écrit `apps/api/openapi.json` ; `apps/web/public/openapi.json` est supprimé.
- **ET-5** — `tools/migration/web-boundary-baseline.json` : le motif `apps/web/app/api/**` est retiré ; `tools/migration/generate-next-routes.mjs` et `migration:routes:check` sont supprimés (plus de fichiers générés).
- **ET-6** — Les tests de sécurité (SPEC-208, SPEC-805) sont exécutés **au travers du relai** (web → api) en plus de l'API directe.

## 7. Comportements attendus et cas limites

- **CL-1** — `apps/api` indisponible → le web répond 502 `problem+json` `{ code: 'API_UNAVAILABLE', status: 502, requestId }` sur `/api/*` ; les pages de l'application, encore lues par les services (jusqu'à SPEC-1202), continuent de s'afficher. Le code est ajouté au catalogue d'erreurs.
- **CL-2** — Client qui abandonne un flux SSE → l'abandon se propage à `apps/api` (fermeture de la connexion amont).
- **CL-3** — Requête avec en-tête `X-Learny-Proxy-Secret` forgé par le navigateur → retiré par le relai puis remplacé par la vraie valeur ; jamais transmis tel quel.
- **CL-4** — Requête `HEAD`/`OPTIONS` → relayée comme les autres méthodes.
- **CL-5** — Corps de 11 Mo sur une route qui l'acceptait (si une telle route existe) → toujours acceptée ; au-delà de la limite d'origine, même refus qu'avant.

## 8. Instructions d'implémentation

1. Fusionner `main` (`node tools/sdd/sync-main.mjs`) pour partir de la V1 livrée.
2. `relay.ts`, branchement dans `proxy.ts`, `X-Served-By`, code `API_UNAVAILABLE`. Commit `feat(SPEC-1201): relaie /api du web vers apps/api`.
3. Exécuter toute la suite e2e **avec** les fichiers `route.ts` encore présents mais court-circuités par le relai ; corriger toute différence dans `apps/api`. Commit `fix(SPEC-1201): …` par écart trouvé.
4. Supprimer `apps/web/app/api/**`, l'adaptateur Next, la génération de routes, `next-test-api-route-handler` ; déplacer les suites. Commit `refactor(SPEC-1201): retire les routes Next du web`.
5. OpenAPI dans `apps/api`. Commit `build(SPEC-1201): publie OpenAPI depuis apps/api`.
6. Démonstration, e2e spécifiques (SSE, cookies, Stripe simulé, 502), visuel ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/lib/api/relay.ts`, `apps/web/lib/api/relay.test.ts`, `apps/api/test/integration/*` (suites déplacées), `apps/api/openapi.json`, `apps/web/components/sdd-demos/spec-1201.tsx`, `apps/web/e2e/specs/p12/spec-1201.spec.ts`.
- **Supprimés** : `apps/web/app/api/**`, `apps/web/lib/api/{next-route,handler,…}.ts` (réexportations), `apps/web/public/openapi.json`, `tools/migration/generate-next-routes.mjs`, tests associés.
- **Modifiés** : `apps/web/proxy.ts`, `apps/web/next.config.ts`, `apps/web/package.json`, `packages/core/src/errors.ts` (`API_UNAVAILABLE`), `packages/contracts/scripts/generate-openapi.ts`, `package.json`, `apps/api/src/app.ts`, `tools/migration/web-boundary-baseline.json`, `docs/architecture/api.md` (emplacement du wrapper, relai), `docs/architecture/overview.md` §2 et §4, `apps/web/app/%5Fdev/sdd/registry.ts`, `pnpm-lock.yaml`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1201` : `h1` « Bascule de l'API » ; carte `data-testid="spec-1201-served-by"` (« Servi par : learny-api ») ; carte `spec-1201-latency` (temps de relai médian sur 10 appels, en ms) ; carte `spec-1201-sse` (« Fragments reçus avant la fin : n ≥ 2 »). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 % (valeurs numériques masquées).

## 11. Critères d'acceptation

- **CA-1** — La suite e2e **complète** passe sur Chromium et la campagne cross-browser passe, sans modification d'assertion.
- **CA-2** — Le dépôt ne contient plus aucun fichier sous `apps/web/app/api/` et `apps/web/package.json` ne dépend plus de `next-test-api-route-handler`.
- **CA-3** — SSE, cookies d'authentification, webhook Stripe simulé et relai sans secret forgé se comportent comme EF-2 à EF-4 et CL-3 (tests dédiés).
- **CA-4** — `apps/api` arrêté : `/api/v1/health` du web répond 502 `API_UNAVAILABLE` et `/` répond toujours.
- **CA-5** — La démonstration affiche « learny-api », un temps de relai et au moins deux fragments SSE.

## 12. Plan de tests

- **Unitaires** — `apps/web/lib/api/relay.test.ts`, `describe('[SPEC-1201] relay')` : URL cible, en-têtes ajoutés et retirés, méthode et corps transmis (CA-3).
- **Intégration** — `apps/api/test/integration/relay-e2e.test.ts`, `describe('[SPEC-1201] web relay')` : web de test + API de test, SSE par fragments, `Set-Cookie`, Stripe signé/altéré, 502 (CA-3, CA-4) ; suites déplacées (CA-2).
- **End-to-end** — `apps/web/e2e/specs/p12/spec-1201.spec.ts`, `test('sert l API par le relai @SPEC-1201')` (CA-5) et `test('discussion du tuteur en flux après bascule @SPEC-1201')` (CA-3), vidéos ; suite complète (CA-1).
- **Visuel** — `test('démonstration de la bascule @SPEC-1201 @visual')` (CA-5).
- **Non-régression** — `pnpm test:e2e` complet, `pnpm test:e2e --project=cross-browser`, `[SPEC-208]`, `@SPEC-805`, `@SPEC-202`, `@SPEC-610`, `@SPEC-210`.

| Critère | Tests |
|---|---|
| CA-1 | e2e complète ; cross-browser |
| CA-2 | contrôle de fichiers ; intégration déplacée |
| CA-3 | unitaire relai ; intégration relai ; e2e tuteur |
| CA-4 | intégration relai |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1201/` : rapports (e2e complète et cross-browser), vidéos (démonstration, discussion du tuteur), captures, journal SSE horodaté, mesures de temps de relai, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : suite e2e complète et cross-browser vertes ; aucune assertion de test modifiée.

## 15. Décisions et hypothèses

ADR-1003 (même origine), ADR-1005 (proxy de confiance). Décision : le relai passe par `proxy.ts` plutôt que par `rewrites` car il doit ajouter des en-têtes ; le code `API_UNAVAILABLE` est un ajout technique au catalogue, sans écran nouveau. Aucune question ouverte.
