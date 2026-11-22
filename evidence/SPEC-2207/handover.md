# SPEC-2207 — handover après la sixième tranche (routes `dev.*` en cours)

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. HEAD de la tranche :
`96a3eaa8`. État : **22 consommateurs et deux crons `py`, pont inline retiré, et 18 des 70
opérations `dev.*` servies par Python avec leurs routes spéciales**. Le worker est entièrement
basculé ; la façade ne relaie plus ces 18 entrées.

## 1. Ce qui est fait dans cette tranche

- **Registre des routes spéciales** (`apps/api-py/src/learny_api/special/__init__.py`) : les 25
  routes `dev/sdd` de développement sont installées avant le pipeline et le relais ; la garde
  `devOnly` ( `ENABLE_SDD_PAGES` valant exactement `true` ou `1`, et `APP_ENV != production`)
  répond le problem+json 404 de `RESOURCE_NOT_FOUND` avant toute authentification. Les opérations
  dont la clé spéciale est `py` ne sont plus installées par `pipeline.install`, mais leurs handlers
  restent déclarés (`handlers/dev.py`) et `test_handlers.py` continue d'imposer l'égalité
  `py_operations == HANDLERS`.
- **18 opérations basculées** (famille → module) : `dev.echo`/`dev.items` →
  `special/dev_echo.py` ; `dev.rateLimit.*` → `special/dev_rate_limit.py` ; `dev.email.*` →
  `special/dev_email.py` ; `dev.stripe.*` → `special/dev_stripe.py` ; `dev.uploadSimulation` →
  `special/dev_upload.py` ; `dev.events.*` et `dev.cron.hourlyTick` → `special/dev_events.py`.
- **Cas d'usage dans leur contexte** : `engagement.application.dev_email` (aperçu, envoi, boîte
  mémoire) avec les fixtures de gabarits dans `locale_fr/engagement_email_fixtures.py` ;
  `billing.application.dev` (Checkout simulé, rejeu, historique) ; `content.application.dev_uploads` ;
  `identity.application.purge_security.purge_rows_in_tx` (purge dans une transaction existante).
  Tout est exporté par le `public.py` du contexte.
- **`service_tx` autorisé** : `learny_api.special.dev_rate_limit` et `learny_api.special.dev_events`
  sont déclarés dans `learny/shared/db/privileged.py` avec leur motif (seaux et lignes synthétiques,
  utilisateurs de fabrique, compteurs d'outbox), comme l'exige le test SPEC-2101.
- **Tests** : sept fichiers d'intégration par famille sous
  `packages-py/learny/tests/integration/dev/` (nominal + garde), harnais commun
  `packages-py/learny/tests/dev_route_support.py` (contexte réel, base réelle quand la route en a
  besoin, horloge figée). Les briques de données sont lues avec `service_tx` dans les tests.
- **`api/ownership.yaml`** : 18 opérations et 18 clés spéciales passent à `py`.

## 2. Ce qui reste exactement

1. **52 opérations `dev.*`** :
   - `dev.notificationsGenerate`, `dev.notify` (SPEC-209/706) et `dev.pushSend` (SPEC-205) ;
   - `dev.personal-data.{deletion.schedule,deletion.cancel,execute,export}` (SPEC-211) ;
   - les **45 `dev.sdd.*`** : spec-007, 009, 1004, 101, 102 (demo/create/remove), 103 à 115, 202,
     411, 501 (demo/create/report/correct), 504 (demo/call), 505 (demo/create/delete), 506, 508,
     509, 510, 511, 512 (demo/suggest/decide), 711, 1203, 1301, `dev.sddApiCoverage`,
     `dev.sddAuthProxy`, `dev.sdd.stripe.session`.
2. **Routes spéciales hors `dev.*`** : `auth/callback`, `health`, `_dev/*`,
   `formations/:fid/sprints`, `relay-stream`.
3. **Opérations hors périmètre** : `auth.*`, `health.get`, `home.get`, `formations.resume`.
4. **E2E complet** `@SPEC-2207` avec vidéo et page `@visual`, `acceptance.md`, puis
   `validate.mjs` et `complete.mjs` (CP-21 reste `pending`, aucun des deux outils n'a été lancé).
5. **`api/inventory.json`** : aucun fichier de contrat n'a changé ; `inventory.mjs --check` est vert
   (217 opérations). Les nouveaux tests n'y figurent pas.

## 3. Reprise des `dev.sdd.*` (conseils)

- Les 45 routes de démonstration ont `auth: public` et une sortie `RootModel[Any]` : seule la garde
  de développement (`guarded()` côté TypeScript, avant toute autre logique) contraint la forme. Les
  implémentations vivent dans `packages/api-routes/src/implementations/dev-sdd.ts` et
  `packages/api-routes/src/dev-sdd/*.ts`.
- Réutiliser le harnais `build_dev_app(..., pipeline_ids=...)` : ces routes ne sont pas des routes
  spéciales, elles traversent le pipeline. La garde s'applique dans le handler (équivalent de
  `guarded()`), avec `ENABLE_SDD_PAGES` lu depuis `call.deps.settings`.
- Les démonstrations qui lisent la base passent par `service_tx` (à déclarer dans `privileged.py`) ;
  les fixtures statiques (spec-110, spec-114, spec-202, spec-1203…) n'en ont pas besoin. Vérifier
  chaque forme contre le TypeScript : ces pages sont assertées par leurs e2e.
- `dev.sddApiCoverage` attend `routeCoverage()` : le porter depuis `packages/api-routes/src/coverage.ts`
  en comptant les routes du registre Python et les spéciales installées.
- `dev.sdd.spec-1301.demo` dépend du scénario natif (`runNativeClientScenario`) : prévoir un port
  dédié, il n'a pas d'équivalent Python.

## 3 bis. Câblage vérifié sur la table réelle

`apps/api-py/tests/integration/test_dev_routes_install.py` construit la façade avec
`api/ownership.yaml` réel et vérifie que chaque opération `dev.*` à `py` est installée exactement
une fois : par le registre spécial pour les routes de développement, par le pipeline pour les autres.
Il a révélé un piège corrigé dans `pipeline.special_path` : `api/inventory.json` et
`api/ownership.yaml` notent les paramètres en `:runId` (Hono), alors que `generated/routes.py` les
note `{runId}` (FastAPI). Toute recherche de clé spéciale doit passer par `special_path`. Sans cela,
`dev.events.demo.run` était servi par le pipeline **sans garde**.

## 4. Points de vigilance

- **Garde** : `ENABLE_SDD_PAGES` est comparée comme une chaîne (`true` ou `1` seulement), jamais
  convertie en booléen ; `APP_ENV=production` ferme les routes même avec le drapeau.
- **Idempotence** : les routes `idempotent: true` exigent un en-tête `Idempotency-Key` valide, comme
  le TypeScript ; les tests le fournissent.
- **Fixtures e-mail** : les textes français sont dans `locale_fr/engagement_email_fixtures.py` ; la
  politique de langue refuse tout non-ASCII hors `locale_fr`, y compris dans les docstrings.
- **`OutboxEntry`** a gagné un champ `at` (instant de capture) : c'est ce qu'expose la boîte de
  démonstration.
- **E2E non rejoué dans cette tranche** : la pile complète (web + façade + Hono + base) n'a pas été
  lancée ; c'est le premier contrôle à faire à la reprise, en particulier
  `@SPEC-201`, `@SPEC-203`, `@SPEC-204`, `@SPEC-205`, `@SPEC-206`, `@SPEC-208`, `@SPEC-210`.


## 5. Cinquième tranche : quinze routes de plus (33/70), 37 restantes

> Le décompte de cette section est historique : voir la section 7 pour l'état courant (40/70).

Date : 2026-11-22. HEAD de la tranche : `8ff21447` (puis le commit de documentation). Les détails et
les décisions sont dans `scope.md` §8 ; voici l'état exact pour reprendre.

**Fait** (15 opérations, avec leurs clés spéciales pour les 7 qui en ont une) :
`dev.personal-data.{deletion.schedule,deletion.cancel,execute,export}`, `dev.notify`,
`dev.notificationsGenerate`, `dev.pushSend`, `dev.sddApiCoverage`, `dev.sddAuthProxy`,
`dev.sdd.stripe.session`, `dev.sdd.spec-007.demo`, `spec-1004.demo`, `spec-110.demo`,
`spec-114.demo`, `spec-1203.demo`. Modules : `learny_api/dev_demos/{personal_data,notifications,
push,sdd,coverage,guard,support}.py`, fixtures dans `locale_fr/{dev_personal_data,dev_notifications,
dev_sdd_fixtures}.py`, handlers dans `handlers/dev.py`.

Tests verts : `packages-py/learny/tests/integration/dev/` (4 fichiers, 64 cas avec la garde) et les
tests unitaires de câblage. `ruff`, `ruff format --check` et `mypy` passent. La suite complète
`pytest` garde des échecs **préexistants** de pollution de base (`test_billing.py`, purge des
exports, livraisons en attente) : la base locale n'a pas été réinitialisée entre deux campagnes ;
relancer `corepack pnpm db:reset` (puis `db:seed:demo`) avant de conclure.

**Reste : 37 opérations `dev.sdd.spec-*`** — 009, 101, 102 (demo/create/remove), 103, 104, 105, 106,
107, 108, 109, 111, 112, 113, 115, 1301, 202, 411, 501 (demo/create/report/correct), 504 (demo/call),
505 (demo/create/delete), 506, 508, 509, 510, 511, 512 (demo/suggest/decide), 711.

Conseils de reprise, par difficulté croissante :

1. **Statiques ou presque** : `spec-202` (destinations post-connexion : porte d'abord
   `resolvePostAuthDestination` dans `learny.identity`, elle n'existe pas encore côté Python),
   `spec-508` (`buildTutorDemo` : aucun équivalent Python, à porter depuis `@learny/tutor/demo`).
2. **Lecture de tables** (`service_tx` à déclarer dans `privileged.py`) : `spec-101`, `103` à `107`,
   `109`, `112` (extraits `sanitizeSnippet`), `113`, `115`, `411`, `711` ; les modules TypeScript
   correspondants sont dans `packages/api-routes/src/dev-sdd/`.
3. **Écritures idempotentes** : `spec-102` (utilisateur de démonstration), `spec-501`
   (create/report/correct d'une brique), `spec-505` (create/delete d'une clé IA), `spec-512`
   (suggest/decide d'une ressource, `decideResourceSuggestion`), `spec-504.call` et `spec-506.run`
   (appels LLM simulés).
4. **Ports dédiés** : `spec-111` s'appuie sur les fabriques de `learny.db/testing` (`withRollback`,
   `createTestProgramme`) absentes du paquet Python : écrire le scénario en SQL dans une transaction
   annulée explicitement, ou déplacer les fabriques dans un module de test partagé.
   `spec-1301` dépend de `runNativeClientScenario` : port dédié, sans équivalent Python.
5. **Ordre imposé** : lots de 10 maximum, un commit par lot, `ownership.yaml` dans le même commit
   que les handlers, tests par famille, puis `ruff`/`mypy`/`pytest`.

E2E de référence pour ces routes : `PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep
"@SPEC-201\b|@SPEC-203\b|@SPEC-204\b|@SPEC-205\b|@SPEC-206\b|@SPEC-208\b|@SPEC-210\b"`.

## 6. E2E rejoué : 7 verts, 18 rouges, diagnostic pour la reprise

Commande : `PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep
"@SPEC-201\\b|@SPEC-203\\b|@SPEC-204\\b|@SPEC-205\\b|@SPEC-206\\b|@SPEC-208\\b|@SPEC-210\\b"`
sur une base remise à zéro puis `db:seed:demo`. Rapport : `test-results/playwright.json`.

Premier passage : 24 rouges, tous les appels de démonstration en 404. Cause trouvée et corrigée
(`fd56855c`) : la pile Playwright passait `ENABLE_SDD_PAGES` à Hono et au web mais **pas à la
façade Python**, qui sert désormais ces routes ; `devOnly` répondait donc 404. Deuxième passage :
**7 verts, 18 rouges**, qui se répartissent en quatre chantiers :

1. **Visuel (7 paires desktop/mobile)** — les pages se rendent, mais l'image diffère de 2 à 3 % en
   desktop et la hauteur change de 22 px en mobile (`spec-201-demo.png`, `spec-204-demo.png`,
   `spec-205-demo.png`, `spec-206-demo.png`, `spec-208-protections.png`). Aucune ligne de base n'a été
   régénérée (interdit). À diagnostiquer page par page : le contenu de démonstration diffère encore
   du TypeScript (une valeur, un compteur ou un libellé).
2. **SPEC-203** — `jobs-step-1-state` reste « En attente » : l'événement `sdd/demo-requested` est
   émis mais le worker ne marque pas les étapes dans le délai du test. Le consommateur
   `devtools.demo_job` est bien enregistré (`apps/worker-py/src/learny_worker/consumers.py:620`) :
   vérifier le démarrage du worker dans la pile (`JOBS_MODE=worker`), le dispatcher et l'écriture de
   `sdd_demo_runs`, ainsi que la lecture de `dev.events.demo.run`.
3. **SPEC-205 / SPEC-206, routes réelles** — écarts de statut : `400` attendu mais `500` reçu sur
   l'abonnement push (unicité, retrait) et `400` attendu mais `201` sur l'envoi de fichier. Ce sont
   les routes de production de SPEC-205/206 (pas les routes `dev.*`) : la parité de validation reste
   à corriger dans le Python, jamais dans le test.
4. **SPEC-210** — la page `/_dev/stripe/checkout` n'affiche pas « Paiement simulé » : la session
   `cs_mock_*` créée par `billing.checkout` (façade) n'est pas retrouvée par `dev.sdd.stripe.session`.
   Piste : `learny.billing.application.dev.get_mock_checkout_session` passe par `mock_gateway(deps)`,
   à vérifier contre l'état du gateway simulé construit par `build_stripe_gateway` ; la session doit
   vivre dans le même état mémoire que celui de `start_checkout`.

Ces quatre points sont indépendants des 15 routes basculées dans cette tranche et touchent des
opérations déjà servies par Python (SPEC-205/206/210/203). Ils constituent la preuve e2e à obtenir
avant `validate.mjs`.

## 7. Sixième tranche : les démos d'état (40/70), 30 restantes

Date : 2026-11-22. Les sept opérations suivantes sont servies par Python, sans clé spéciale (elles
traversent le pipeline et la garde est dans le handler, comme `guarded()` côté TypeScript) :
`dev.sdd.spec-101.demo`, `spec-102.{demo,create,remove}`, `spec-109.demo`, `spec-202.demo`,
`spec-505.demo`.

- **Module** : `learny_api/dev_demos/sdd_state.py` (une fonction par page, 15-30 lignes utiles) et
  `learny_api/dev_demos/support.py::rolled_back`, le pendant de `withRollback` : une transaction du
  rôle propriétaire ouverte sur le moteur partagé et **toujours annulée**, donc une page ne laisse
  jamais de trace (spec-101, spec-102 contraintes, spec-109).
- **`spec-202`** : `resolvePostAuthDestination` est portée dans
  `learny/identity/domain/destination.py` (`is_safe_next_path` en `TypeGuard[str]`) et exportée par
  `identity/public.py` ; la table des sept profils du TypeScript est reproduite telle quelle.
- **`spec-505`** : `tutor.list_credentials` (service réel) plus la lecture de la taille et de l'IV
  du chiffré ; `ProviderRegion` gagne `requires_base_url` et `key_optional`, les deux drapeaux du
  formulaire. La page répond `DEMO_SEED_MISSING` quand le compte de démonstration est absent.
- **`spec-102.create`/`remove`** : la page crée (ou supprime) le compte `spec102-…@test.learny.test`
  par une insertion dans `auth.users`, le déclencheur d'inscription construisant les six lignes
  dépendantes (EF-1, EF-4). `demoEmail()` reste calée sur l'horloge injectée.
- **Réponses vides** : `ensureDemoUser`/`removeDemoUser` ne rendent rien et `loadSpec102Demo` rend
  `null` sans compte. Le pipeline rendant un corps vide pour `None`, ces trois cas répondent
  explicitement le JSON `null` (`nothing()`), pour que le client web retrouve le corps du TypeScript.
- **Tests** : `packages-py/learny/tests/integration/dev/test_dev_sdd_state_demos.py` (12 cas :
  nominal par famille + la garde sur les sept chemins). `ruff`, `ruff format --check`, `mypy` et les
  suites unitaires (`3659 passed`) sont verts ; `inventory.mjs --check` reste à 217 opérations.
- **Reste : 30 opérations `dev.sdd.spec-*`** — 009, 103, 104, 105, 106, 107, 108, 111, 112, 113, 115,
  1301, 411, 501 (demo/create/report/correct), 504 (demo/call), 505 (create/delete), 506, 508, 509,
  510, 511, 512 (demo/suggest/decide), 711. Les conseils de la section 5 restent valables :
  `spec-111` et `spec-1301` exigent des ports dédiés, `spec-508` doit porter `buildTutorDemo`, et
  les démos 103 à 107 construisent leurs fixtures dans `withRollback` (utiliser `rolled_back`).

## 7 bis. Septième tranche : les démos d'action (44/70), 26 différées

Date : 2026-11-22. HEAD de la tranche : `a9fbd54b`. Quatre opérations de plus sont servies par
Python, sans clé spéciale (pipeline et garde dans le handler, comme `guarded()`) :
`dev.sdd.spec-501.demo`, `dev.sdd.spec-505.create`, `dev.sdd.spec-505.delete` et
`dev.sdd.spec-506.run`.

- **Module** : `learny_api/dev_demos/sdd_actions.py`. `demo_identity` lit le compte de démonstration
  (`profiles.email = fixture.DEMO_USER_EMAIL`) et rend un `identity.Actor` ; les pages qui écrivent
  appellent le cas d'usage réel (`tutor.create_credential`, `tutor.delete_credential`,
  `tutor.qualify_credential`) puis rechargent la page d'état `sdd_state.spec_505`, exactement comme
  `loadSpec505Demo` côté TypeScript. Aucune logique métier n'est dupliquée dans la démo.
- **Socle** : `support.new_user` et `support.demo_email` remplacent les doublons de `sdd_state`
  (adresse horodatée par l'horloge injectée, jamais `random`) ; `support.DELETE_AUTH_USER` supprime
  dans un `finally` le compte isolé que `spec-506` construit pour une requête. `DevDeps` du harnais
  gagne `llm` (`MockGateway(load_registry())`), la dépendance que la qualification lit.
- **Textes** : `DEMO_ABSENT`, `CHOOSE_PROVIDER_MODEL`, `KEY_ID_MISSING` rejoignent
  `locale_fr/dev_sdd_fixtures.py`, copiés mot pour mot de `implementations/dev-sdd.ts`.
- **Tests** : `packages-py/learny/tests/integration/dev/test_dev_sdd_action_demos.py`, 8 cas — la
  page 501 avec et sans compte, le cycle création/lecture/suppression d'une clé et ses deux refus
  400, le run de qualification qui ne laisse aucun compte (`auth.users`), le refus 404 sans compte
  de démonstration, la garde 404 sur les quatre chemins. Vérifications : `ruff check`,
  `ruff format --check packages-py apps`, `mypy packages-py apps`, `pytest apps/api-py/tests/unit`
  (162 passés), puis base remise à zéro (`db:reset --yes`) et
  `pytest packages-py/learny/tests/integration/dev apps/api-py/tests/integration/test_dev_routes_install.py`
  (232 passés, 11 sautés).

## 8. Démos différées (26 des 30 restantes)

Décision assumée de cette tranche : une démo qui ne se porte pas en ~10 minutes reste `ts` et est
documentée ici. Trois causes expliquent les 26 lignes.

### 8.1 Cause A — les fabriques de `@learny/db/testing` n'existent pas en Python (10 routes)

Les pages 103 à 115 construisent de trois à six fixtures dans `withRollback` avec `createTestUser`
et `asUser` (`packages/db/src/testing/index.ts`), `createTestProgramme` et `createTestCourse`
(`packages/db/src/testing/programme.ts`), ou avec des dépôts `@learny/db` sans équivalent Python
exposé (`createGroup`/`joinGroup`, `packages/db/src/repositories/groups.ts:143,312` ;
`createScheduleSlot`, `moveScheduleSlot`, `getDailyActivity`, `listMilestones`,
`createAutomationAction` ; `sanitizeSnippet`, `packages/db/src/schema/privacy-search.ts:81`).
Porter ces fabriques est un chantier à part, pas une démo : `support.rolled_back` et
`sdd_state._page_user` en couvrent seulement la transaction et le compte.

| Route | Raison précise | Ce qu'il faudrait pour la porter |
| --- | --- | --- |
| `dev.sdd.spec-103.demo` | arbre de programme + six sondes de contraintes en savepoints + plan FTS ; > 10 min | `loadSpec103Demo` (`spec-103.ts`) et `createTestUser`/`createTestProgramme` |
| `dev.sdd.spec-104.demo` | note, passages et sondes de contraintes, tous en `withRollback` | `loadSpec104Demo` (`spec-104.ts`) et les deux fabriques |
| `dev.sdd.spec-105.demo` | deux versions de cours, section corrigée, citation et discussion | `loadSpec105Demo` (`spec-105.ts`) plus `createTestCourse` |
| `dev.sdd.spec-106.demo` | treize briques, trois versions ordonnées, tentative et réponses liées à leur version | `loadSpec106Demo` (`spec-106.ts`) et les deux fabriques |
| `dev.sdd.spec-107.demo` | trois états de notion, historique de révision, lacune active et un second élève | `loadSpec107Demo` (`spec-107.ts`) et les deux fabriques |
| `dev.sdd.spec-108.demo` | cinq créneaux, un déplacement, action à consentement, activité et deux jalons | `loadSpec108Demo` (`spec-108.ts`) et les cinq dépôts de créneaux/activités |
| `dev.sdd.spec-111.demo` | groupe de trois membres, code d'invitation déterministe, vue de progression, compteur | `loadSpec111Demo` (`spec-111.ts`), `createGroup`/`joinGroup`, `listGroupProgress`, `countActiveFormations` |
| `dev.sdd.spec-112.demo` | deux élèves, cours, exports, acceptations et clés d'idempotence, recherche sous JWT | `loadSpec112Demo` (`spec-112.ts`), `createTestCourse`, `asUser`, `sanitizeSnippet` |
| `dev.sdd.spec-113.demo` | matrice RLS à trois comptes sous JWT réels + catalogue de politiques | `loadSpec113Demo` (`spec-113.ts`), `createGroup`/`joinGroup`, `RLS_MATRIX`/`categoryCounts`, `asUser` |
| `dev.sdd.spec-115.demo` | lit le jeu de démonstration semé, y compris les attendus du seed | `loadSpec115Demo` (`spec-115.ts`) et les constantes `DEMO_*`, `demoUserId`, `demoFormationId` de `packages/db/src/seed/fixtures.ts` |

### 8.2 Cause B — le cas d'usage appelé n'existe pas encore en Python (11 routes)

Une démo doit appeler le cas d'usage Python existant, jamais le réécrire : ces routes attendent
donc le port du service, pas un handler de démonstration.

| Route | Raison précise | Ce qu'il faudrait pour la porter |
| --- | --- | --- |
| `dev.sdd.spec-009.demo` | `buildSddConfigDemo` rend `simulated` et `invalidFields` en rejouant `parseServerEnv` sur un environnement simulé ; `Settings` (pydantic) ne porte ni cette validation ni la liste `SERVER_ENV_KEYS` | `buildSddConfigDemo` (`deps/env.ts:67`) et le schéma `packages/config/src/env.ts` (`parseServerEnv`, `parsePublicEnv`) |
| `dev.sdd.spec-501.create` | la page crée une brique par le service, absent côté Python | `createDemoBrick` (`spec-501.ts`) et `createBrick` (`packages/services/src/bricks/brick-service.ts:167`) |
| `dev.sdd.spec-501.report` | la page signale la brique puis relit sa charge publique | `reportDemoBrick` (`spec-501.ts`), `report_brick` existe, mais `getPublicBrick` (`brick-service.ts:391`) manque |
| `dev.sdd.spec-501.correct` | idem : correction puis relecture de la charge publique | `correctDemoBrick` (`spec-501.ts`) et `getPublicBrick` ; `correct_brick` existe déjà |
| `dev.sdd.spec-504.demo` | la table de résolution des modèles n'a pas d'équivalent Python (aucun `resolve_model` dans `learny.platform.llm`) | `loadResolutionDemo` (`spec-504.ts`) et `resolveModel` (`packages/llm/src/resolve.ts:29`) |
| `dev.sdd.spec-504.call` | idem, plus l'ouverture d'une session simulée par scénario | `runMockCall` (`spec-504.ts`), `resolveModel` et `createSession` (`packages/llm/src/session.ts:159`) |
| `dev.sdd.spec-508.demo` | `buildTutorDemo` est un service entier (487 lignes) qui compose sept étapes de tuteur | `buildTutorDemo` (`packages/tutor/src/demo.ts`) porté dans `learny.tutor` |
| `dev.sdd.spec-512.demo` | la recherche web simulée n'existe pas côté Python | `loadSearchWebDemo` (`spec-512.ts`), `searchWeb` (`packages/tutor/src/tools/search-web.ts:156`), `createProviderSearch` |
| `dev.sdd.spec-512.suggest` | la suggestion de ressource n'existe pas côté Python | `suggestSpec512` (`implementations/dev-sdd.ts`) et `suggestResource` (`packages/tutor/src/services/resource-suggestions.ts:85`) |
| `dev.sdd.spec-512.decide` | la décision de suggestion n'existe pas côté Python | `decideSpec512` et `decideResourceSuggestion` (`resource-suggestions.ts:161`) |
| `dev.sdd.spec-1301.demo` | le scénario est un pilote de client natif (HTTP réel + modèle de tuteur préparé), sans équivalent Python | `devSddSpec1301Demo` et `runNativeClientScenario` (`packages/testing/src/native-client`) |

### 8.3 Cause C — un pipeline réel à rejouer dans une transaction annulée (5 routes)

Ces pages ne lisent pas des tables : elles font tourner l'ingestion ou la notation réelles sur une
fixture construite en SQL (ressource, passages, injections, tentative notée), puis mesurent le
résultat. Le port demande le pipeline complet plus la fixture, très au-delà de dix minutes.

| Route | Raison précise | Ce qu'il faudrait pour la porter |
| --- | --- | --- |
| `dev.sdd.spec-411.demo` | tentative réellement notée (activité, brique, réponses, lacunes) puis lecture de l'outbox et des créneaux | `loadSpec411Demo` (`spec-411.ts`) avec `createTestProgramme` et la fixture de notation |
| `dev.sdd.spec-509.demo` | deux ingestions réelles et un échec + reprise, vecteurs simulés | `loadSpec509Demo` (`spec-509.ts`) et `createTestProgramme` |
| `dev.sdd.spec-510.demo` | extraction et découpage réels, légendes et vision simulées | `loadSpec510Demo` (`spec-510.ts`) et `createTestProgramme` |
| `dev.sdd.spec-511.demo` | recherche sémantique déterministe, deux élèves du même groupe, quatre budgets | `loadSpec511Demo` (`spec-511.ts`), `createTestProgramme` et `asUser` |
| `dev.sdd.spec-711.demo` | les dix clés du registre et le moteur réel sur un compte fixture supprimé ensuite | `loadSpec711Demo` (`spec-711.ts`) et `createTestUser` |

### 8.4 Conséquence pour la clôture

Il ne reste donc plus de démo « bon marché » : `py_operations == HANDLERS` couvre 44 des 70
opérations `dev.*`, les 26 autres sont `ts` avec leur raison ci-dessus. Les trois causes sont des
chantiers identifiés (fabriques de test, services `@learny/llm` et `@learny/tutor`, pipelines
d'ingestion), pas des oublis de la tranche. Les quatre chantiers e2e du §6 restent ouverts et
indépendants.


## 9. Huitième tranche : santé, SSE, scan de secrets, reprise et auth (+12 routes)

Date : 2026-11-22. Commits : `1e650bfd` puis `a1901b66` (santé, relay-stream, scan de secrets),
`dd86eec5` (reprise de formation), `d6d91585` (auth et callback). Base remise à zéro puis semée avant
les runs d'intégration.

### 9.1 Ce qui est fait

**Opérations (8 des 9 restantes)** : `health.get`, `formations.resume` et les six `auth.*`
(`magicLink`, `resend`, `signIn`, `signOut`, `signUp`, `callback`). `api/ownership.yaml` porte donc
**190 opérations `py` sur 217** ; les 27 `ts` restantes sont `home.get` et les 26 démos
`dev.sdd.*` du §8.

**Routes spéciales (4 des 7 restantes)** : `GET /api/v1/health`, `POST /api/v1/_dev/secret-scan`,
`GET /api/v1/dev/sdd/relay-stream` et `GET /api/v1/auth/callback`. Les 3 restantes sont ci-dessous.

Détails :

- **Santé** : `learny/shared/health.py` porte `probeDatabase`/`buildInfo`/`buildStatus` ; la sonde est
  bornée à 2 s (`asyncio.timeout`), une base non explicitement configurée répond `not_configured`
  (`Settings.database_configured` lit `model_fields_set`, donc la présence réelle de `DATABASE_URL`),
  et `Database.ping()` exécute le `select 1`. Le handler rend la `Response` du document SPEC-006
  EF-2 : le pipeline n'ajoute que l'identifiant de requête, le timing et `x-served-by`, exactement
  comme `routeHandler` pour une réponse directe.
- **Deux gardes distinctes**, comme le TypeScript : `special/guards.py` porte `devRoutesEnabled`
  (`true` **ou** `1`, jamais en production) pour les démos et `sddPagesEnabled` (la valeur exacte
  `true`) pour les outils `_dev`, qui répondent un 404 **vide** et non un problem+json.
- **Scan de secrets** : `learny/shared/secret_scan.py` porte `scanText` (14 motifs, premier motif
  gagnant en cas de recouvrement, aperçu masqué) ; `isForbiddenSecretFile` n'est pas porté, le
  backend Python ne parcourt pas le dépôt.
- **Reprise** : `resume_formation` rejoue `formations/resume.ts` et réutilise
  `learning.replan_formation_in_tx` ; le doublon `replan_formation_after_resume` d'`engagement.pause`
  est supprimé (ADR-2034).
- **Auth** : `learny.identity.application.auth` (port de `auth/requests.ts`, `finalize.ts`,
  `verify.ts`) et `learny.identity.infrastructure.auth_cookies` (adaptateur de `@supabase/ssr`) ;
  `GoTrueSession` conserve le document GoTrue brut, ce qui rend le cookie byte-identique.
  `finalize_first_verification` écrit les deux acceptations, les conditions et le fuseau, puis émet
  `user/signed-up` dans la même transaction.
- **Parité corrigée** : un cookie refusé par le serveur d'authentification est une requête anonyme
  (`supabaseSessionResolver` rend `null`). Le portage levait `UNAUTHENTICATED`, ce qui rendait la
  déconnexion sans session impossible (CL-10 exige 204). `_cookie_actor` rend `None` ; le test
  unitaire correspondant est renommé et assied la nouvelle attente.

### 9.2 Différés de la tranche (une ligne par route, comme la règle de déferrement)

| Route | Raison précise | Couple fichier + fonction à porter |
| --- | --- | --- |
| `home.get` | agrégat de 18 lectures SQL (1 340 lignes) **sans aucun test** dans `api/inventory.json` : aucun oracle, plus que le budget d'une route | `packages/services/src/home/get-home.ts::getHome` et `packages/domain/src/home/derive.ts` (13 fonctions pures, libellés `locale_fr`, `HomeDto` du contrat) |
| `POST /api/v1/_dev/commit-check` | dépend de `@commitlint/config-conventional` + `@commitlint/lint` (règles `commitlintRules` et plugin `commitlintPlugin`) ; décision de ne pas embarquer une bibliothèque Node dans la façade | `packages/api-routes/src/special/sdd-tools.ts::commitCheck`, `packages/config/src/commitlint*.ts` |
| `POST /api/v1/_dev/demo-job` | exige l'adaptateur d'étapes `executeDirect` et `DEMO_STEPS` (exécution directe d'un job Inngest sans serveur) et `sddDemoStore` : chantier d'outillage, pas une route | `packages/api-routes/src/special/sdd-tools.ts::demoJob`, `packages/jobs/src/...::runDemoJob`, `packages/jobs/src/testing` |
| `POST /api/v1/formations/:fid/sprints` | `planSprintsBeforeMilestones` est un service de 857 lignes (automatisme 8) sans équivalent Python | `packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts::planSprintsBeforeMilestones` |

`ADR-2023` reste donc ouverte pour `home.get` ; `ADR-2022` et `ADR-2024` sont remplacées par
`ADR-2034`.

### 9.3 Preuves

| Commande | Résultat |
| --- | --- |
| `uv run ruff check .` | vert |
| `uv run ruff format --check packages-py apps` | vert (638 fichiers) |
| `uv run mypy packages-py apps` | vert (632 fichiers) |
| `uv run pytest apps/api-py/tests packages-py/learny/tests/unit` | 3 735 passés |
| `uv run pytest … tests/integration/identity` (dont le vecteur de cookies) | 10 cas de parité octet pour octet + 66 unitaires |
| `uv run pytest … tests/integration/formation` (base remise à zéro) | 51 passés (dont 6 pour la reprise) |
| `api/oracles/vectors/auth-cookies.json` | 7 échanges enregistrés depuis Hono (`@supabase/ssr` 0.12.7) |

Les quatre chantiers e2e du §6 restent ouverts et indépendants ; `acceptance.md`, `validate.mjs` et
`complete.mjs` n'ont pas été lancés (CP-21 reste `pending`).
