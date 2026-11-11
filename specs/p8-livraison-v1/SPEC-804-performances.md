---
id: SPEC-804
title: Performances
phase: P8
priority: V1
depends_on: [SPEC-802]
business_rules: [BR-PLA-07]
screens: []
adrs: [ADR-0041, ADR-0202]
visual: demo   # mockup (écran maquetté) | tokens (écran sans maquette) | demo (page de démonstration SDD)
---

# SPEC-804 — Performances

## 1. Objectif

Mesurer et tenir les budgets de performance de Learny (LCP < 2,5 s, INP < 200 ms, CLS < 0,1 au 75ᵉ centile en profil mobile ; API p95 < 300 ms hors IA sous 50 utilisateurs virtuels), optimiser ce qui les dépasse (images, polices, découpage du code, index de base vérifiés par `EXPLAIN`) et livrer la commande **`pnpm test:perf`**, exigée par `tools/sdd/checkpoint.mjs` aux checkpoints CP-8 et CP-9.

## 2. Contexte

- ADR-0041 fixe les budgets et les outils (Lighthouse CI en profil mobile, k6 à 50 utilisateurs virtuels). Les modalités exactes (pages, nombre de passages, calcul du 75ᵉ centile, mesure de l'INP, budgets de ressources, scénario de charge) sont fixées par **ADR-0202** (créé ici).
- `tools/sdd/checkpoint.mjs` exécute `pnpm -s test:perf` après `build`, `test:unit`, `test:int` et `test:e2e` : l'application est donc déjà construite et la base locale disponible (Supabase CLI, SPEC-008) quand la commande démarre ; elle doit réinitialiser elle-même ses données.
- Documents : `docs/architecture/api.md` (routes), `docs/architecture/data-model.md` (index), `docs/engineering/testing.md` §3 (horloge figée, `LLM_MODE=mock`), `docs/product/screens.md` (routes des écrans principaux).

## 3. Dépendances

- **SPEC-802** (doit être `done`) : écrans définitifs (dispositions mobiles), sans CLS lié au responsive.
- Transitivement : tous les écrans P6/P7, SPEC-115 (jeu de démonstration et identifiants de l'utilisateur de démonstration exposés par `@learny/testing`), SPEC-004 (configuration Playwright), SPEC-008 (`pnpm db:reset`, `pnpm db:seed:demo`), SPEC-208 (limitation de débit : profil par défaut 120 requêtes/min/utilisateur), SPEC-010 (journalisation).
- Outils (dernière version stable, ADR-0003) : `@lhci/cli` (≥ 0.14), `web-vitals` (≥ 4, build `attribution`), `@next/bundle-analyzer`, k6 (≥ 1.0) : binaire `k6` s'il est dans le `PATH`, sinon image Docker `grafana/k6` à la version exacte inscrite dans `tools/perf/k6-version.txt` (Docker est déjà requis par SPEC-008). En CI : action `grafana/setup-k6-action`. Si ni `k6` ni Docker ne sont disponibles, `test:perf` échoue avec le message « k6 introuvable : installez k6 ou Docker » (pas de contournement silencieux).
- Chromium : celui de Playwright (`chromium.executablePath()`), passé à Lighthouse via `CHROME_PATH`.

## 4. Règles métier couvertes

- **BR-PLA-07** — LCP < 2,5 s et INP < 200 ms au 75ᵉ centile sur les pages principales : Lighthouse CI (LCP, CLS, TBT) en 5 passages mobiles par page et calcul du 75ᵉ centile (EF-2), INP mesuré par Playwright + `web-vitals` sur des interactions scriptées en 5 passages (EF-3) ; API p95 < 300 ms hors appels IA : test de charge k6 à 50 utilisateurs virtuels sur les routes de lecture et d'écriture sans IA (EF-4).

## 5. Exigences fonctionnelles

- **EF-1 — Commande.** `pnpm test:perf` (script racine → `node tools/perf/run.mjs`) enchaîne, et s'arrête au premier échec d'infrastructure : (1) préparation des données (`pnpm db:reset`, `pnpm db:seed:demo`, `pnpm perf:seed`) ; (2) démarrage de `next start` sur le port 3100 avec `NODE_ENV=production`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `EMAIL_MODE=memory`, `STRIPE_MODE=mock`, `ENABLE_SDD_PAGES=false` (attente de `/api/v1/health` = `ok`, 60 s max) ; (3) Lighthouse CI ; (4) INP Playwright ; (5) k6 ; (6) rapport ; (7) arrêt du serveur. Code de sortie 0 seulement si **tous** les budgets sont tenus. Option `--only=lighthouse|inp|k6` pour le développement local. Durée cible ≤ 25 min.
- **EF-2 — Pages et budgets Lighthouse.** Profil mobile par défaut de Lighthouse (émulation mobile, ralentissement CPU ×4, throttling simulé), 5 passages par URL, utilisateur de démonstration connecté (Alex Perrin) : `/connexion` (anonyme), `/accueil`, `/agenda?vue=semaine&date=2026-11-11`, `/formations/<SAP>/programme`, `/formations/<SAP>/modules/<M3>`, `/formations/<SAP>/modules/<M3>/cours?chapitre=<C2>`, `/formations/<SAP>/quiz-global`, `/formations/<SAP>/carte`, `/formations/<SAP>/lacunes`, `/parametres`. Budgets au **75ᵉ centile** (méthode du rang le plus proche : valeur de rang ⌈0,75 × n⌉ des n passages triés, soit le 4ᵉ sur 5) : LCP < 2 500 ms, CLS < 0,1, TBT < 300 ms (indicateur de laboratoire complémentaire), score de performance ≥ 0,85 ; budgets de ressources (transfert compressé, par page) : JavaScript ≤ 200 Ko (pages connectées) et ≤ 130 Ko (`/connexion`), CSS ≤ 50 Ko, polices ≤ 2 fichiers et ≤ 120 Ko, images ≤ 300 Ko, nombre total de requêtes ≤ 60.
- **EF-3 — INP.** Projet Playwright `perf` (Chromium, 390×844, `isMobile`, CPU ×4 via CDP `Emulation.setCPUThrottlingRate`, réseau 150 ms / 1,6 Mbit/s via `Network.emulateNetworkConditions`), 5 passages par scénario, `web-vitals` `onINP(…, { reportAllChanges: true })` injecté avant le chargement ; scénarios : accueil → ouvrir le panneau des notifications ; quiz global → retourner la carte de rappel puis « Bon » ; quiz de validation → choisir une option puis « Vérifier » (réponse simulée) ; carte des notions → saisir « clé » puis Entrée ; paramètres → onglet Notifications puis basculer un interrupteur ; agenda → passer de Semaine à Mois. Budget : INP p75 < 200 ms par scénario.
- **EF-4 — Charge API.** Script `tools/perf/k6/api-load.js` : 50 utilisateurs virtuels (`perf-01` … `perf-50`, créés par `pnpm perf:seed`), montée 30 s, palier 2 min, descente 30 s ; chaque itération choisit une requête selon la répartition : `GET /api/v1/home` 20 %, `GET /api/v1/notifications/unread-count` 15 %, `GET /api/v1/agenda?from=2026-11-09&to=2026-11-15&formation=all` 15 %, `GET /api/v1/notifications?filter=all` 10 %, `GET /api/v1/formations/:fid/programme` 10 %, `GET /api/v1/formations/:fid/global-quiz/today?mode=full` 10 %, `GET /api/v1/formations/:fid/gaps` 5 %, `GET /api/v1/formations/:fid/notion-graph` 5 %, `GET /api/v1/search?q=piece` 5 %, `POST /api/v1/notifications/read-all` 5 % ; pause 1 s entre itérations (≈ 60 requêtes/min/utilisateur, sous la limite de 120). Seuils : `http_req_duration{expected_response:true}` p95 < 300 ms au global **et** pour chaque route (étiquette `name`), `http_req_failed` < 1 %, aucune réponse 429. Aucune route IA n'est appelée (`/tutor/*`, génération, cadrage).
- **EF-5 — Rapport.** `test-results/perf/report.json` et `report.md` : date, commit, environnement (CPU, mémoire, version de Node, de Chromium, de k6), pour chaque page les 5 valeurs et le p75 de LCP/CLS/TBT/score et les budgets de ressources, pour chaque scénario les 5 INP et le p75, pour k6 p50/p95/p99 global et par route, taux d'échec ; chaque ligne marquée `ok`/`ko`. Le rapport est copié dans `evidence/SPEC-804/perf-report.json` lors de la validation de cette spécification et dans `evidence/checkpoints/CP-8/` par l'agent au checkpoint (copie manuelle documentée dans le résumé, sans modifier `checkpoint.mjs`).
- **EF-6 — Page de démonstration** `/_dev/sdd/SPEC-804` : tableau des budgets (valeurs d'ADR-0202), dernier rapport disponible (`evidence/SPEC-804/perf-report.json` lu côté serveur, sinon « Aucun rapport : lancez pnpm test:perf »), et panneau « Mesure en direct » qui affiche, pour la page de démonstration elle-même, LCP, CLS et INP (`web-vitals`) mis à jour après un clic sur le bouton « Simuler une interaction ».

## 6. Exigences techniques

- **ET-1 — Fichiers d'outillage** (`tools/perf/`) : `run.mjs` (orchestrateur, sans dépendance hors Node et des binaires cités), `server.mjs` (démarrage/arrêt de `next start`, port 3100), `auth.mjs` (connexion de l'utilisateur de démonstration par `POST /api/v1/auth/sign-in` avec les identifiants exportés par `@learny/testing` ; fabrique l'en-tête `Cookie` passé à Lighthouse par `settings.extraHeaders`), `lighthouserc.cjs` (`collect.numberOfRuns: 5`, `collect.url` résolues par `urls.mjs` depuis la base, `settings.chromeFlags: '--headless=new --no-sandbox'`, `upload.target: 'filesystem'`, `outputDir: test-results/perf/lhci`), `budget.json` (budgets de ressources d'EF-2, format Lighthouse `budgets`), `assert-lighthouse.mjs` (lit les `lhr-*.json`, calcule les p75, compare), `k6/api-load.js`, `k6-version.txt`, `run-k6.mjs` (binaire ou Docker : `docker run --rm -i --add-host=host.docker.internal:host-gateway -e BASE_URL=http://host.docker.internal:3100 -v <tools/perf/k6>:/scripts grafana/k6:<version> run --summary-export=/scripts/out/summary.json /scripts/api-load.js`), `report.mjs`, `p75.ts` (fonction pure `percentileNearestRank(values, 0.75)`).
- **ET-2 — Projet Playwright `perf`.** Ajouté à `apps/web/playwright.config.ts` **uniquement si** `process.env.PW_PERF === '1'` (il n'est donc jamais exécuté par `pnpm test:e2e` ni par `--project=cross-browser`) ; `testDir: e2e/perf`, `retries: 0`, `workers: 1`, vidéo désactivée. Fichier `apps/web/e2e/perf/inp.perf.ts`.
- **ET-3 — Données de charge.** `pnpm perf:seed` (`packages/db/src/seed/perf.ts`, idempotent, utilise les fabriques de `@learny/testing`) : 50 utilisateurs `perf-NN@learny.test` (mot de passe de test généré et enregistré dans `packages/db/src/seed/perf-credentials.ts`, valeur de test locale uniquement), chacun avec 1 formation active de 7 modules, 48 notions, 120 `notion_states` dont 14 dues le 2026-11-11, 300 `review_logs`, 60 `schedule_slots` sur novembre, 40 notifications ; plus un utilisateur volumineux `perf-heavy@learny.test` : 3 formations, 900 notions, 15 000 `review_logs`, 2 000 créneaux, 1 000 notifications, 400 ressources et 8 000 passages (embeddings simulés), qui sert aux contrôles `EXPLAIN`.
- **ET-4 — Index vérifiés.** Test d'intégration `packages/db/test/integration/query-plans.test.ts` : après `perf:seed`, `ANALYZE`, puis `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` des requêtes réellement émises par les services (capturées via le journal Drizzle de chaque service) pour `perf-heavy` ; exigences : aucun `Seq Scan` sur une table de plus de 5 000 lignes, temps d'exécution < 50 ms. Requêtes et index attendus (créés par migration s'ils manquent, et ajoutés à `docs/architecture/data-model.md`) :

| Requête (service) | Index attendu |
|---|---|
| notions dues (`learning.getDueNotions`) | `notion_states (user_id, due_at) where in_review` (existant) |
| créneaux d'une période (`agenda.list`) | `schedule_slots (user_id, starts_at)` (existant) |
| liste des notifications (`notifications.list`) | `notifications (user_id, created_at desc)` (nouveau) |
| compteur non lues (`notifications.unreadCount`) | `notifications (user_id) where read_at is null` (nouveau, partiel) |
| historique d'une notion (`learning.applyReview`, maîtrise) | `review_logs (user_id, notion_id, reviewed_at desc)` (nouveau) |
| lacunes d'une formation (`gaps.list`) | `notion_states (user_id) where gap_nature is not null and gap_cleared_at is null` (nouveau, partiel) |
| sessions du jour (`globalQuiz.getToday`) | `activities (owner_id, formation_id, kind, for_date)` (nouveau) |
| banque d'une notion (`bricks.draw`) | `bricks (owner_id, formation_id, purpose, status)` (nouveau) + `brick_versions (fingerprint)` (existant) |
| sections et citations d'un cours (`courses.get`) | `course_sections (course_id, position)`, `citations (section_id)` (nouveaux) |
| journal des automatismes | `automation_actions (user_id, created_at desc)` (existant) |
| dépense du jour | `ai_calls (user_id, created_at)` (existant) |
| recherche sémantique | HNSW `resource_chunks.embedding` (existant), filtre `(owner_id, resource_id)` |

- **ET-5 — Optimisations obligatoires** (vérifiées par les budgets et par des tests unitaires de configuration) : images via `next/image` (formats `image/avif`, `image/webp`, `sizes` renseigné, `priority` uniquement sur l'élément LCP de chaque page) ; polices Inter et Space Grotesk via `next/font/google` (`subsets: ['latin']`, `display: 'swap'`, poids limités à ceux des jetons : Inter 400/600/700, Space Grotesk 600) avec `adjustFontFallback` pour éviter le CLS ; découpage du code par `next/dynamic` (rendu client à la demande) pour la carte des notions (`ssr: false`), le panneau du tuteur, les quatre jeux de SPEC-702, la palette de l'examen, l'éditeur de tableau de l'exercice, le graphique d'historique des tentatives ; `optimizePackageImports: ['lucide-react', 'date-fns']` ; aucune bibliothèque de plus de 30 Ko compressés importée dans la coquille sans justification dans le rapport du bundle ; réponses de lecture d'API avec `Cache-Control: private, no-store` (données personnelles) mais requêtes TanStack Query dédupliquées (`staleTime` 30 s, ADR-0063) ; Server Components pour les lectures initiales (pas de cascade client) ; squelettes aux dimensions finales (CLS).
- **ET-6 — Analyse du bundle.** `pnpm analyze` (`ANALYZE=true next build`) produit `test-results/perf/bundle/*.html` ; un test unitaire lit `.next/app-build-manifest.json` après `build` et vérifie que les modules de la carte, du tuteur et des jeux n'apparaissent pas dans le premier chargement de `/accueil`.
- **ET-7 — Mesures serveur.** Chaque réponse d'API porte l'en-tête `Server-Timing: app;dur=<ms>` (durée du handler, hors réseau), utilisé par k6 pour distinguer temps serveur et réseau dans le rapport ; aucune donnée personnelle dans cet en-tête.

## 7. Comportements attendus et cas limites

- **CL-1 — Variabilité de la machine.** Les budgets sont évalués sur le p75 de 5 passages ; une mesure aberrante isolée n'échoue pas. Si un budget échoue, `run.mjs` ne relance pas automatiquement : l'agent corrige la cause (aucune « relance jusqu'au vert » ni assouplissement de budget, AGENTS.md).
- **CL-2 — Port 3100 occupé.** `server.mjs` échoue avec un message explicite et le code 2 (ne tue aucun processus étranger).
- **CL-3 — Base locale arrêtée.** `run.mjs` lance `pnpm dev:up` une fois (SPEC-008) puis réessaie le contrôle de santé ; en cas d'échec, sortie 2 « Base locale indisponible ».
- **CL-4 — Limitation de débit déclenchée pendant k6.** Une réponse 429 fait échouer le seuil (EF-4) : le scénario est dimensionné pour ne pas l'atteindre ; un 429 révèle donc un défaut (seau partagé, mauvaise clé) à corriger.
- **CL-5 — Page avec données vides** (utilisateur sans formation) : non mesurée par Lighthouse ; couverte par le contrôle CLS des squelettes (tests unitaires de dimensions).
- **CL-6 — Session expirée pendant les 5 passages Lighthouse.** `auth.mjs` crée une session valable au moins 1 h avant chaque URL ; une redirection vers `/connexion` détectée dans le `lhr` (`finalDisplayedUrl`) fait échouer la mesure avec « session perdue ».
- **CL-7 — Écart entre horloge serveur figée et horloge du navigateur Lighthouse.** Le helper d'horloge client utilise la valeur figée publiée par le layout racine quand `CLOCK_FIXED_AT` est défini (`<meta name="learny-clock-fixed-at">`, ajouté ici si SPEC-207 ne l'a pas fait), évitant toute erreur d'hydratation.
- **CL-8 — Exécution sous Windows.** `run.mjs` n'utilise que des API Node multiplateformes ; Docker Desktop fournit `host.docker.internal`.
- **CL-9 — Migration d'index sur une base volumineuse.** Les index sont créés avec `create index concurrently if not exists` dans des migrations dédiées (hors transaction), compatibles avec la production (SPEC-808).

## 8. Instructions d'implémentation

1. Ajouter `p75.ts` et ses tests, `budget.json`, `lighthouserc.cjs`, `urls.mjs`, `auth.mjs`, `server.mjs`, `assert-lighthouse.mjs`, `report.mjs`, `run.mjs` ; scripts racine `test:perf`, `perf:seed`, `analyze`. Commit `build(SPEC-804): ajoute la commande test:perf`.
2. Ajouter le seed de charge (ET-3). Commit `feat(SPEC-804): ajoute les données de charge`.
3. Ajouter le projet Playwright `perf` et `inp.perf.ts`. Commit `test(SPEC-804): mesure l'INP des interactions principales`.
4. Ajouter `k6/api-load.js`, `run-k6.mjs`, `k6-version.txt`, l'en-tête `Server-Timing` dans `handler()`. Commit `test(SPEC-804): ajoute le test de charge de l'API`.
5. Écrire `query-plans.test.ts`, ajouter les migrations d'index manquants (ET-4) et mettre à jour `data-model.md`. Commit `perf(SPEC-804): ajoute les index vérifiés par EXPLAIN`.
6. Exécuter `pnpm test:perf`, consigner le rapport initial dans `evidence/SPEC-804/perf-before.json`, puis optimiser (ET-5) par commits `perf(SPEC-804): …` (polices, images, découpage, requêtes) jusqu'au respect de tous les budgets.
7. Ajouter la page `/_dev/sdd/SPEC-804` et ses tests. Commit `feat(SPEC-804): ajoute la page de démonstration des performances`.
8. Ajouter l'étape `test:perf` au workflow CI de checkpoint (job manuel `workflow_dispatch` et sur tag `v*`, avec `grafana/setup-k6-action`). Commit `ci(SPEC-804): exécute test:perf sur les tags de version`.

## 9. Fichiers et composants concernés

- **Créés** : `tools/perf/{run.mjs,server.mjs,auth.mjs,urls.mjs,lighthouserc.cjs,budget.json,assert-lighthouse.mjs,report.mjs,run-k6.mjs,k6-version.txt,p75.ts}`, `tools/perf/k6/api-load.js`, `tools/perf/test/*.test.ts`, `apps/web/e2e/perf/inp.perf.ts`, `packages/db/src/seed/perf.ts`, `packages/db/src/seed/perf-credentials.ts`, `packages/db/test/integration/query-plans.test.ts`, migrations d'index, `apps/web/app/_dev/sdd/SPEC-804/page.tsx` (ou entrée du registre de démonstration), `apps/web/e2e/specs/p8/performance.spec.ts`.
- **Modifiés** : `package.json` racine (scripts), `apps/web/playwright.config.ts` (projet `perf` conditionnel), `apps/web/next.config.ts` (images, `optimizePackageImports`, analyseur), layout racine (polices, méta d'horloge), écrans optimisés, `apps/web/lib/api/handler.ts` (`Server-Timing`), `.github/workflows/` (étape perf), `docs/architecture/data-model.md`, `.gitignore` (`test-results/perf`, `tools/perf/k6/out`).
- **Lus / réutilisés** : identifiants de démonstration de `@learny/testing` (SPEC-115), fabriques, `pnpm db:reset`, `pnpm db:seed:demo`.

## 10. Interface et conformité visuelle

- Mode `demo` (ADR-0049) : page `/_dev/sdd/SPEC-804` composée avec `@learny/ui` (PageHeader « SPEC-804 · Performances », Card, tableau `ScrollableTable`). Structure : section « Budgets » (`data-testid="perf-budgets"`, une ligne par budget d'ADR-0202), section « Dernier rapport » (`data-testid="perf-report"`, date, commit, statut global `ok`/`ko`, tableau par page et par route), section « Mesure en direct » (`data-testid="perf-live"`, valeurs LCP/CLS/INP avec unités, bouton « Simuler une interaction » qui exécute un calcul de 50 ms pour produire une valeur INP observable).
- Contrôles automatisés : (1) `expectTokens` (titre Space Grotesk, cartes, bouton noir) ; (2) structure et textes ; (4) ligne de base `toHaveScreenshot` (rapport de démonstration figé `apps/web/e2e/fixtures/perf-report.sample.json`, horloge figée au 2026-11-11T12:20:00Z, seed SPEC-115). Pas de comparaison maquette.

## 11. Critères d'acceptation

- **CA-1** — `pnpm test:perf` existe, s'exécute de bout en bout sur une base fraîchement ensemencée et sort avec le code 0 ; le rapport `report.json` contient les 10 pages, les 6 scénarios INP et les 10 routes k6.
- **CA-2** — Pour chacune des 10 pages, LCP p75 < 2 500 ms, CLS p75 < 0,1, TBT p75 < 300 ms et score ≥ 0,85 (profil mobile, 5 passages).
- **CA-3** — Pour chacun des 6 scénarios, INP p75 < 200 ms.
- **CA-4** — k6, 50 utilisateurs virtuels : p95 < 300 ms au global et pour chaque route, `http_req_failed` < 1 %, 0 réponse 429.
- **CA-5** — Les budgets de ressources d'EF-2 sont tenus sur chaque page ; les modules de la carte, du tuteur et des jeux sont absents du premier chargement de `/accueil`.
- **CA-6** — `query-plans.test.ts` : aucune lecture séquentielle sur une table de plus de 5 000 lignes et chaque requête listée s'exécute en moins de 50 ms pour `perf-heavy`.
- **CA-7** — `percentileNearestRank` est correct (cas tabulés) et la page `/_dev/sdd/SPEC-804` affiche budgets, dernier rapport et mesure en direct.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-804] …')`) :
  - `tools/perf/test/p75.test.ts` : [1..5] → 4 ; [10] → 10 ; valeurs non triées ; tableau vide → erreur.
  - `tools/perf/test/assert-lighthouse.test.ts` : lecture de `lhr` d'exemple, détection d'un dépassement de LCP, de budget JS, de session perdue (CL-6).
  - `tools/perf/test/k6-thresholds.test.ts` : le script k6 déclare les seuils d'EF-4 et la répartition (somme = 100 %), aucune route IA.
  - `apps/web/test/unit/next-config.test.ts` : formats d'images, `optimizePackageImports`, polices limitées aux poids des jetons.
  - `apps/web/test/unit/bundle-split.test.ts` (exécuté après `build`) : absence des modules lourds dans le premier chargement d'`/accueil`.
- **Intégration** (`[SPEC-804]`) :
  - `packages/db/test/integration/query-plans.test.ts` : plans et durées (ET-4).
  - `packages/db/test/integration/perf-seed.test.ts` : idempotence et volumes d'ET-3.
  - `apps/web/test/integration/server-timing.test.ts` : en-tête `Server-Timing` présent sur une route d'API, sans donnée personnelle.
- **End-to-end** (`@SPEC-804`, vidéo, projet `desktop` et `mobile`) — `apps/web/e2e/specs/p8/performance.spec.ts` :
  - `page de démonstration des performances @SPEC-804` : ouvre `/_dev/sdd/SPEC-804`, vérifie budgets et rapport d'exemple, clique « Simuler une interaction », attend une valeur INP affichée.
  - `vitals de l'accueil sans régression @SPEC-804` : `/accueil` connecté, mesure LCP et CLS via `web-vitals` (1 passage, sans ralentissement), vérifie CLS < 0,1 et l'absence de requête vers les modules différés.
  - Le projet `perf` (EF-3) n'est exécuté que par `pnpm test:perf`.
- **Visuel** (`@SPEC-804 @visual`) : `page de démonstration des performances @SPEC-804 @visual` — jetons, structure, `toHaveScreenshot`.
- **Non-régression** : rejouer `@SPEC-603`, `@SPEC-609`, `@SPEC-616`, `@SPEC-701`, `@SPEC-704`, `@SPEC-707` (écrans optimisés) et tous les `@visual` des écrans touchés par l'étape 6.

| Critère | Tests |
|---|---|
| CA-1 | exécution de `pnpm test:perf` (rapport copié en preuve), `k6-thresholds.test.ts` |
| CA-2 | `assert-lighthouse.test.ts`, rapport `test:perf` |
| CA-3 | `inp.perf.ts` (via `test:perf`), `page de démonstration des performances @SPEC-804` |
| CA-4 | `k6-thresholds.test.ts`, rapport `test:perf`, `server-timing.test.ts` |
| CA-5 | `bundle-split.test.ts`, `next-config.test.ts`, `vitals de l'accueil sans régression @SPEC-804` |
| CA-6 | `query-plans.test.ts`, `perf-seed.test.ts` |
| CA-7 | `p75.test.ts`, `page de démonstration des performances @SPEC-804 @visual` |

## 13. Preuves attendues

- `evidence/SPEC-804/perf-before.json` (avant optimisation) et `perf-report.json` (final), `perf-report.md` ; rapports Lighthouse HTML de `/accueil` et `/formations/<SAP>/quiz-global` ; `k6-summary.json` ; rapport du bundle (`bundle-client.html`).
- Vidéo de la page de démonstration ; capture `perf-demo.png`.
- Dans `acceptance.md`, chaque critère cite la valeur mesurée (p75, p95) et le budget.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : `pnpm test:perf` vert sur la machine d'exécution, rapport final commité en preuve, aucun budget assoupli, index ajoutés documentés dans `data-model.md`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0041 (budgets), ADR-0049 (page de démonstration), ADR-0063 (TanStack Query), ADR-0047 (horloge), ADR-0070 (outils de test).
- **ADR-0202 créé** (« Mesure des performances et commande test:perf ») : 10 pages et 6 scénarios, 5 passages, p75 au rang le plus proche, TBT < 300 ms et score ≥ 0,85 en complément, budgets de ressources, INP par Playwright + `web-vitals` (CPU ×4, réseau 150 ms / 1,6 Mbit/s), scénario k6 et seuils par route, index vérifiés par `EXPLAIN`, `test:perf` hors de `test:e2e`.
- Hypothèse : la machine d'exécution des checkpoints est la référence des mesures ; les mesures de production (champ réel) relèvent de l'exploitation et ne conditionnent pas la version.
- Complément signalé : index supplémentaires au modèle de données (ET-4) et en-tête `Server-Timing`.
