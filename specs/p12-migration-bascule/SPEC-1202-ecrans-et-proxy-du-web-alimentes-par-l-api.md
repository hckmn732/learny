---
id: SPEC-1202
title: Écrans et proxy du web alimentés par l'API
phase: P12
priority: migration
depends_on: [SPEC-1201]
business_rules: []
screens: []
adrs: [ADR-0338, ADR-0342, ADR-0041, ADR-0332, ADR-0252]
visual: demo
---

# SPEC-1202 — Écrans et proxy du web alimentés par l'API

## 1. Objectif

Faire lire toutes les données des écrans produit et du proxy par l'API : les chargeurs rendus côté serveur (`lib/*-page.ts`), les pages et composants serveur et `proxy.ts` n'importent plus aucun paquet serveur. Ils appellent `apps/api` avec `@learny/api-client` en mode serveur. Le rendu, le contenu et les performances des écrans restent identiques.

## 2. Contexte

ADR-0338 §2 et §4 : rendu serveur conservé, données lues par l'API, surcoût médian ≤ 25 ms par page. Inventaire au démarrage de la piste (hors `app/_dev`, traité par SPEC-1203) : 8 pages, 28 modules `lib/` (dont 15 chargeurs `*-page.ts` : accueil, agenda, cadrage, exercice, bilan final, lacunes, quiz global, groupe, paramètres des notifications, carte des notions, programme, recherche, paramètres, modèles d'IA, etc.), 15 composants et `proxy.ts` (`canAccessFormation`). Exemple : `lib/home-page.ts` appelle `getHome(ctx)`, équivalent à `GET /api/v1/home` (`homeGet`). Lire ADR-0338, ADR-0041, ADR-0332, ADR-0252 et `docs/architecture/api.md` §2.

## 3. Dépendances

- **SPEC-1201** : `apps/api` sert tout `/api` ; relai et proxy de confiance.
- `@learny/api-client` (SPEC-1002) ; mesures `pnpm test:perf` (SPEC-804).

## 4. Règles métier couvertes

Aucune règle `BR-*` ; les écrans affichent les mêmes données.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque écran produit rend le même HTML qu'avant pour les mêmes données (mêmes régions, textes, `data-testid`) ; les comparaisons visuelles existantes passent sans nouvelle ligne de base.
- **EF-2** — Un chargeur qui reçoit une erreur de l'API rend le même état d'erreur qu'aujourd'hui avec le même `requestId` (propagé depuis la réponse `problem+json`).
- **EF-3** — `proxy.ts` décide l'accès à une formation (404 avant rendu, SPEC-615) par `GET /api/v1/formations/:fid/access` : 204 si la formation est accessible, 404 sinon. Route ajoutée au registre et à `docs/architecture/api.md` (lecture interne, `rateLimit: 'none'`, `auth: 'user'`).
- **EF-4** — Si un chargeur ne trouve aucune route existante qui renvoie exactement son DTO, une route de lecture est ajoutée au registre avec ce DTO (ajout seulement, aucune route existante modifiée) et inscrite dans `docs/architecture/api.md`. L'inventaire « chargeur → route » est écrit dans `docs/architecture/ssr-loaders.md`.
- **EF-5** — La page `/_dev/sdd/SPEC-1202` affiche l'inventaire (chargeur, route appelée, temps serveur médian avant et après) et le résultat du budget (« ≤ 25 ms : Oui/Non » par page).

## 6. Exigences techniques

- **ET-1** — `apps/web/lib/api/server-client.ts` : `serverApi()` crée un client `@learny/api-client` avec `baseUrl = API_INTERNAL_URL + '/api/v1'`, en-têtes `cookie` (cookies de la requête via `next/headers`), `X-Request-Id` (identifiant de la requête de page), `X-Learny-Proxy-Secret`, `X-Forwarded-Host`, `X-Forwarded-Proto` et `X-Forwarded-For` ; utilisable seulement côté serveur (`import 'server-only'`).
- **ET-2** — Mesure de référence : avant toute modification, `pnpm test:perf` est exécuté et son rapport copié dans `evidence/SPEC-1202/perf-before.json` ; après, `perf-after.json` ; le test `tools/perf/test/ssr-overhead.test.ts` compare les temps serveur médians par page.
- **ET-3** — `readPageSession()` (`lib/supabase/page.ts`) ne vérifie plus le jeton par `getUser()` quand la page délègue ses données à l'API : elle se limite à lire la présence de session pour la redirection, l'API faisant foi (ADR-0340, une vérification locale par requête).
- **ET-4** — La liste de référence de SPEC-1001 ne contient plus aucun fichier hors `apps/web/app/%5Fdev/**` et `apps/web/components/sdd-demos/**` à la fin de cette spécification.
- **ET-5** — TanStack Query côté client : les clés et fonctions existantes (`lib/query-keys.ts`) ne changent pas ; seule la source serveur des données initiales change.

## 7. Comportements attendus et cas limites

- **CL-1** — `apps/api` indisponible pendant le rendu d'une page → même écran d'erreur qu'une panne de base aujourd'hui (frontière d'erreur, ADR-0272), pas de page blanche.
- **CL-2** — Session expirée entre le proxy et l'API → l'API répond 401 ; le chargeur redirige vers `/connexion` comme aujourd'hui.
- **CL-3** — Formation d'un autre apprenant → 404 décidé par le proxy avant le flux de rendu (inchangé).
- **CL-4** — Page avec plusieurs chargeurs → appels parallèles (`Promise.all`), jamais en série si les données sont indépendantes.
- **CL-5** — Dépassement du budget de 25 ms sur une page → la spécification n'est pas terminée ; optimisation (appels parallèles, route agrégée existante) avant toute autre solution.

## 8. Instructions d'implémentation

1. Mesure de référence (ET-2). Commit `test(SPEC-1202): mesure le rendu serveur avant la bascule des écrans`.
2. `serverApi()`, route `formationAccessGet`, bascule de `proxy.ts`. Commit `feat(SPEC-1202): décide l'accès aux formations par l'API`.
3. Écrire l'inventaire `docs/architecture/ssr-loaders.md`, puis basculer les chargeurs **un écran par commit** (`refactor(SPEC-1202): lit <écran> par l'API`), en rejouant `@SPEC-<écran>` après chaque commit.
4. Composants serveur et pages restants, liste de référence réduite. Commit `refactor(SPEC-1202): retire les services des écrans du web`.
5. Mesure après, test de surcoût, démonstration, e2e, visuel ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/lib/api/server-client.ts`, `docs/architecture/ssr-loaders.md`, `tools/perf/test/ssr-overhead.test.ts`, `apps/web/components/sdd-demos/spec-1202.tsx`, `apps/web/e2e/specs/p12/spec-1202.spec.ts`.
- **Modifiés** : `apps/web/proxy.ts`, `apps/web/lib/*-page.ts` (15), les autres modules de `apps/web/lib/` couplés, les 8 pages et 15 composants couplés, `apps/web/lib/supabase/page.ts`, `packages/contracts/src/{formation-management,routes}.ts` (`formationAccessGet`), `packages/api-routes/src/implementations/formations.ts`, `docs/architecture/api.md`, `tools/migration/web-boundary-baseline.json`, `apps/web/app/%5Fdev/sdd/registry.ts`.

## 10. Interface et conformité visuelle

Aucun écran produit ne change : toutes les comparaisons visuelles `@visual` existantes (mode `mockup` et `tokens`) sont rejouées sans mise à jour de ligne de base. Démonstration `/_dev/sdd/SPEC-1202` : `h1` « Écrans alimentés par l'API » ; tableau `data-testid="spec-1202-loaders"` (« Écran », « Route », « Médiane avant », « Médiane après », « Budget ») ; synthèse `spec-1202-budget`. Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 % (valeurs numériques masquées).

## 11. Critères d'acceptation

- **CA-1** — Aucun fichier de `apps/web` hors `app/_dev` et `components/sdd-demos` n'importe un paquet serveur (lint et test de frontière).
- **CA-2** — Toutes les comparaisons visuelles existantes et la suite e2e complète passent sans nouvelle ligne de base ni modification d'assertion.
- **CA-3** — Pour chaque page mesurée, la médiane du temps serveur augmente de 25 ms au plus ; les budgets ADR-0041/ADR-0332 sont tenus.
- **CA-4** — `proxy.ts` renvoie 404 pour la formation d'un autre apprenant avant le rendu (`@SPEC-615`).
- **CA-5** — `docs/architecture/ssr-loaders.md` couvre 100 % des chargeurs et la démonstration l'affiche avec le budget respecté.

## 12. Plan de tests

- **Unitaires** — `apps/web/lib/api/server-client.test.ts`, `describe('[SPEC-1202] server api client')` : en-têtes transmis, propagation du `requestId`, erreurs (CA-2) ; `tools/migration/test/unit/boundary.test.ts` (cas `[SPEC-1202]`) (CA-1) ; `tools/perf/test/ssr-overhead.test.ts`, `describe('[SPEC-1202] ssr overhead')` (CA-3).
- **Intégration** — `apps/api/test/integration/formation-access.test.ts`, `describe('[SPEC-1202] formation access')` : 204/404 (CA-4) ; `apps/web/test/integration/ssr-loaders.test.ts`, `describe('[SPEC-1202] ssr loaders')` : chaque chargeur renvoie le même DTO que l'ancien service (CA-2, CA-5).
- **End-to-end** — `apps/web/e2e/specs/p12/spec-1202.spec.ts`, `test('affiche l inventaire et le budget @SPEC-1202')` (CA-5), vidéo ; suite complète (CA-2).
- **Visuel** — `test('démonstration des écrans alimentés par l API @SPEC-1202 @visual')` (CA-5) ; toutes les `@visual` existantes (CA-2).
- **Non-régression** — `pnpm test:e2e` complet, `pnpm test:perf`, `@SPEC-603`, `@SPEC-615`, `@SPEC-704`, `@SPEC-707`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire frontière ; lint |
| CA-2 | intégration chargeurs ; e2e complète ; `@visual` existants |
| CA-3 | surcoût SSR ; `test:perf` |
| CA-4 | intégration accès ; `@SPEC-615` |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1202/` : `perf-before.json`, `perf-after.json`, tableau de surcoût, rapports e2e complets, vidéo, captures, inventaire, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : budgets de performance tenus et aucune ligne de base visuelle régénérée.

## 15. Décisions et hypothèses

ADR-0338 (rendu serveur par l'API, budget de 25 ms). Décision : les routes de lecture ajoutées pour un chargeur reprennent un DTO existant et n'exposent aucune donnée nouvelle. Aucune question ouverte.
