# SPEC-2207 — handover après la cinquième tranche (routes `dev.*` en cours)

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
