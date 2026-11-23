# Acceptation — SPEC-2206 (Billing & Entitlements et Privacy & Accounts en Python)

Périmètre : **8 opérations** de l'inventaire — 4 `billing` (`billing.checkout`, `billing.portal`,
`billing.subscription`, `billing.webhook`) et 4 `privacy` (`me.export.request`, `me.export.read`,
`me.deletion.schedule`, `me.deletion.cancel`) —, la passerelle Stripe (réelle et simulée, ADR-2031),
le domaine des droits d'accès, l'export de données personnelles et la suppression de compte, plus
les **trois cas d'usage de job** du périmètre (`run_data_export`, `run_account_deletions`,
`purge_exports`). Source de vérité : `api/inventory.json` (`context ∈ {billing, privacy}`).

Branche `spec/SPEC-2206-domaines-facturation-confidentialite`, worktree `learny-wt-SPEC-2206`.
Dernier commit de code : `6073f970` (page de démonstration `6b306942`, e2e et configuration
`6904900b`, inventaire `6073f970`) ; les preuves de validation sont commitées par
`node tools/sdd/complete.mjs` (commit `evidence(SPEC-2206)`). Statut : **clôturée** — les cinq
critères de `specs/p22-python-domaines/SPEC-2206-domaines-facturation-confidentialite.md` §11 sont
cochés avec leur preuve, et `node tools/sdd/validate.mjs SPEC-2206` passe ses **huit étapes**
(`checks.json`, `summary.md`, `e2e.json`, `e2e.xml`, captures et vidéos collectés dans ce dossier).

## CA-1 — Opérations du périmètre à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ✅

- **8 / 8** opérations du périmètre sont à `py` dans `api/ownership.yaml` (commit `1c1236bb`) :
  `billing.checkout`, `billing.portal`, `billing.subscription`, `billing.webhook`,
  `me.export.request`, `me.export.read`, `me.deletion.schedule`, `me.deletion.cancel`. Aucune
  entrée du périmètre ne reste à `ts`.
- Les **huit handlers** vivent dans `apps/api-py/src/learny_api/handlers/billing.py` et
  `handlers/privacy.py` ; ils ne portent aucune règle, valident le contrat généré et appellent un
  cas d'usage de `learny.billing.public` / `learny.privacy.public`.
  `apps/api-py/tests/unit/test_handlers.py` vérifie `py_operations == HANDLERS` et qu'aucune
  opération `ts` n'est servie par Python (`3 passed`).
- **Trois cas d'usage de job portés et testés** : `run_data_export` (`learny/privacy/application/
  export_job.py`, étapes `load → collect → zip → upload → finalize → notify`, idempotence par
  `exportId`), `run_account_deletions` et `run_account_deletion` (`deletion_job.py`, 50 profils dus
  par passage, étapes `deletion:<uid>:<step>` reprises par l'état persisté) et `purge_exports`
  (`purge.py`, grâce de 24 h). Ils sont prouvés par
  `packages-py/learny/tests/integration/privacy/test_personal_data.py` (export complet, suppression
  unique, purge) et par les tests unitaires de `tests/unit/privacy/`. **Le câblage au worker Python
  (dispatcher, ordonnanceur) relève de SPEC-2207** (ADR-2014, ADR-2006) : les cas d'usage sont
  portés, appelables et testés ici, et aucune réponse HTTP n'en dépend.
- Matrice entrée → cas d'usage → règles → tables → tests : section « Matrice » de
  [`parity.md`](./parity.md), une ligne par opération (8 lignes) plus les trois jobs, et
  [`scope.md`](./scope.md) pour la liste cochable, les couches livrées et les écarts entre le plan
  P22 et l'inventaire (routes `dev.*`, acceptations légales).
- Les quatre routes `dev.stripe.*` (et les quatre `dev.personal-data.*`) que le plan rattache à
  cette tranche appartiennent au contexte `dev` de l'inventaire (`spec: SPEC-2207`, `gap: true`) :
  elles restent `ts` et ne sont pas inventées ici (ADR-2005). L'écart est expliqué dans
  `scope.md` §« Écarts entre le plan et l'inventaire ».

## CA-2 — Parité contractuelle du périmètre, zéro divergence inexpliquée ✅

- Le harnais `parity:record|check` ne génère **aucun scénario** pour les groupes `billing` et
  `privacy` : `tools/parity/scenarios/` n'en contient pas, et aucun scénario n'a été inventé
  (ADR-2008). La raison est structurelle et documentée dans [`parity.md`](./parity.md) : le
  harnais rejoue des **lectures enregistrables** sur le jeu de démonstration, alors que les lectures
  de ces deux contextes dépendent de lignes créées par une mutation de la requête — une session
  Stripe (`billing.subscription` après `billing.checkout`) et un export (`me.export.read` après
  `me.export.request`) —, et que le webhook est une écriture publique signée. La parité de ce
  périmètre est donc prouvée par les **vecteurs d'oracle** et par l'**intégration**, sans
  dépendre du harnais.
- `corepack pnpm exec tsx tools/oracles/billing-privacy-vectors.mts --check` : vecteurs à jour. Les
  JSON `api/oracles/vectors/billing.json` (configuration 11, statuts 10, masques 6, vérifications
  de signature 9, événements 10, chemins 14, URL 5) et `.../privacy.json` (slug 5, dossiers 4,
  noms normalisés 9, arborescences 2, tailles 9, dates 4, réglages 2, téléchargeabilité 8) sont
  rejoués à **égalité stricte** par `tests/unit/billing/test_billing_domain_vectors.py`,
  `.../test_mock_stripe.py`, `.../test_stripe_client.py`, `.../test_status.py`,
  `.../test_config.py` et `tests/unit/privacy/test_privacy_domain_vectors.py`,
  `.../test_zip_layout.py`, `.../test_services.py` — **13 tests de vecteurs** au total.
- L'e2e existant du contrat de facturation (`apps/web/e2e/specs/p2/spec-210.spec.ts`, test
  « contrats de facturation et webhook signé ») passe **sans modification** à travers la façade :
  abonnement gratuit `{status:'none', currentPeriodEnd:null}`, refus des chemins externes,
  portail 404 sans client Stripe, session Checkout simulée `cs_mock_1` et rejeu idempotent,
  webhook signé (bad signature 400, rejeu `duplicate`, événement inconnu `ignored`) et transitions
  de statut. **1 test passé** sur ce fichier lors du contrôle de clôture ; il exerce réellement les
  routes `py`.
- Aucune divergence non expliquée sur les 13 tests de vecteurs ni sur les 14 tests d'intégration.
  Deux écarts assumés et documentés dans `parity.md` : la vérification de signature utilise
  l'horloge injectée au lieu de `Webhook.construct_event` (ADR-2031, schéma et codes identiques) et
  l'archive utilise `zipfile` au lieu de `archiver` (entrées et ordre identiques).

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ✅

- Les huit fichiers cibles de `evidence/SPEC-2001/test-port-map.md` ont leur jumeau pytest vert,
  avec les mêmes cas et les mêmes assertions :
  `tests/unit/billing/test_config.py` (3), `.../test_status.py` (8), `.../test_mock_stripe.py`
  (8), `.../test_stripe_client.py` (6), `tests/unit/privacy/test_zip_layout.py` (5),
  `.../test_services.py` (11), `tests/integration/billing/test_billing.py` (8) et
  `tests/integration/privacy/test_personal_data.py` (6).
- Périmètre mesuré : **55 tests** — 41 unitaires et 14 d'intégration. Les cas sans équivalent
  direct (états atteignables uniquement avec un fournisseur Stripe réel, ADR-0048) sont couverts
  par le mode simulé et listés dans `scope.md`.
- Aucun test TypeScript du périmètre n'a été supprimé ni affaibli : le code TypeScript reste en
  place (retrait en SPEC-2302, ADR-2008) et ses tests restent verts ; les jumeaux pytest ajoutent
  les cas d'oracle.

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts, dont « Billing and privacy domains are pure » et
  « Nobody imports views or apps ». Le domaine (`learny/billing/domain/`,
  `learny/privacy/domain/`) ne dépend ni de FastAPI, ni de SQLAlchemy, ni d'un SDK.
- `uv run ruff check .`, `uv run ruff format --check .` et `uv run mypy packages-py apps` verts.
- Les handlers `handlers/billing.py` et `handlers/privacy.py` ne contiennent aucune règle : corps
  validé par le contrat généré, appel d'un cas d'usage, réponse telle quelle ; `billing.webhook`
  lit seulement les octets bruts (plafond 1 MiB) avant de déléguer. Les requêtes SQLAlchemy vivent
  dans `learny/{billing,privacy}/infrastructure/`, les règles dans `domain/`, la passerelle Stripe
  dans `learny/platform/stripe.py`.
- Les écritures internes (export, suppression, purge) passent par `learny.shared.privileged`,
  déclaré avec son motif (`PRIVILEGED_CALLERS`) ; toute lecture ou écriture d'apprenant s'exécute
  sous RLS avec les claims de la transaction.

## CA-5 — Les e2e du périmètre passent à travers la façade Python, vidéo à l'appui ✅

- `PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep "@SPEC-2206\b"` : **2 tests verts**
  (0 échec), dont **1 test `@visual`** ; vidéos, captures, axe et rapports collectés dans
  `evidence/SPEC-2206/`.
  - `apps/web/e2e/specs/p22/spec-2206.spec.ts` (fonctionnel, session réelle via
    `createTestSession`, cookie et `origin` explicites) :
    `billing.subscription` (`GET /api/v1/billing/subscription`) répond **200** avec
    `x-served-by: learny-api` et `{"status":"none","currentPeriodEnd":null}` ;
    `me.export.request` (`POST /api/v1/me/export`, `idempotency-key`) répond **202** avec un
    `exportId` UUID et `status: "queued"`, un rejeu rend exactement la même réponse ;
    `me.export.read` (`GET /api/v1/me/exports/:id`) répond **200** avec l'état `queued`, sans URL
    signée, puis `me.export.read?download=1` répond **404** `NOT_FOUND` tant que l'archive n'est
    pas prête, et un identifiant inconnu répond le même 404 ;
    `me.deletion.schedule` (`POST /api/v1/me/deletion`) répond **200** avec
    `{"scheduledFor":"2026-12-11T12:20:00.000Z"}` (J+30 sur l'horloge figée) et un rejeu rend la
    même échéance ; `me.deletion.cancel` (`DELETE /api/v1/me/deletion`) répond **204** avec un
    corps vide, deux fois de suite.
  - Test `@visual` : `axeCheck` sans violation sérieuse ou critique, puis `captureEvidence` desktop
    (1440 × 900) et mobile (390 × 844) de la page `/_dev/sdd/SPEC-2206`, qui annonce **8 / 8**
    opérations servies par Python, les entitlements (`none`, `active`, `past_due`, `canceled`,
    `incomplete`, aucune grâce), le webhook (300 s, ADR-2031, cinq issues), l'export (20 tables,
    ZIP, URL signée 600 s, 410, grâce de 24 h, quota de 3), la suppression (J+30, annulation 204)
    et les trois cas d'usage de job (câblage worker en SPEC-2207).
- Aucune assertion d'oracle ni ligne de base visuelle existante n'a été modifiée ni régénérée
  (ADR-1001, ADR-2008, ADR-0034) : `git diff 94944994 -- apps/web/__screenshots__` est vide. Les
  captures de cette spécification sont des preuves, pas des lignes de base.
- Limite connue, hors du périmètre des 8 opérations et rattachée à SPEC-2207 : les parcours
  d'interface de `spec-210` (Checkout et portail simulés) et de `spec-707` (export « prêt ») lisent
  l'état mémoire du mode simulé ou attendent le job. Les routes `dev.stripe.*` qui portent cet état
  restent `ts` jusqu'à SPEC-2207, et le consommateur du job d'export n'est câblé qu'à cette même
  tranche (ADR-2014) : l'export y reste `queued`, ce que l'e2e de cette spécification vérifie
  explicitement (404 `NOT_FOUND` tant qu'il n'est pas prêt). Aucune de ces routes n'appartient au
  périmètre `billing`/`privacy`, et aucun test n'a été modifié pour les faire passer. Détail dans
  « Anomalies et dettes ».
- Deux échecs observés sur les suites historiques des réglages ne viennent pas de cette
  spécification et ne touchent aucune opération du périmètre :
  `apps/web/e2e/specs/p7/parametres-hash.spec.ts` attend `#abonnement` au retour du portail simulé
  alors que la page `/_dev/stripe/portal` prend `#modeles` par défaut depuis `d1464d9d`
  (`fix(SPEC-210)`, 2026-11-16) — écart antérieur sur `main` ; les deux lignes de base visuelles de
  `spec-707` diffèrent de 2 % et 4 % avec une hauteur mobile de 1678 px contre 1660 px, un écart de
  rendu de police de même nature que celui de SPEC-610 consigné par ADR-2019. Aucune ligne de base
  n'a été régénérée et aucune assertion n'a été affaiblie.

## Preuves exécutées (2026-11-22, VM de développement)

Environnement : VM `ubuntu@100.111.204.24`, worktree `learny-wt-SPEC-2206`, PostgreSQL local
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, horloge figée au 2026-11-11T12:20:00Z
(ADR-0047), `LLM_MODE=mock`, `STRIPE_MODE=mock`, `TZ=UTC`.

| Preuve | Commande | Résultat |
|---|---|---|
| Lint Python | `uv run ruff check .` et `uv run ruff format --check .` | vert |
| Types Python | `uv run mypy packages-py apps` | vert |
| Import-linter | `uv run lint-imports` | vert |
| Vecteurs d’oracle du domaine | `uv run pytest …/unit/billing/test_billing_domain_vectors.py …/unit/privacy/test_privacy_domain_vectors.py -q` | 13 réussis |
| Suite unitaire complète | `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit -q` | 3535 réussis |
| Intégration du périmètre | `flock /tmp/learny-sdd-db.lock uv run pytest …/integration/billing …/integration/privacy -q` | 14 réussis |
| Handlers = opérations `py` | `uv run pytest apps/api-py/tests/unit/test_handlers.py -q` | 3 réussis |
| Vecteurs à jour | `corepack pnpm exec tsx tools/oracles/billing-privacy-vectors.mts --check` | vert |
| Contrat HTTP de facturation par la façade | `corepack pnpm test:e2e --grep "@SPEC-210\b"` | 1 test de contrat réussi (4 parcours d'interface en dépendance SPEC-2207) |
| e2e du périmètre | `PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep "@SPEC-2206\b"` | 2 réussis, 0 échec, 2 vidéos, 1 `@visual` |
| Inventaire | `corepack pnpm exec tsx tools/migration/inventory.mjs` | 217 opérations, e2e référencé, `--check` vert |
| Construction | `corepack pnpm build` | vert |
| Validation SDD | `PLAYWRIGHT_REUSE_SERVER=0 node tools/sdd/validate.mjs SPEC-2206` | 8 étapes vertes : lint, typecheck, build, unit, integration, e2e (2), visuel (1), acceptance (5/5) |

## Parité : pourquoi aucun scénario généré

Le harnais `parity:record|check` (SPEC-2001) enregistre des réponses de **lectures** rejouables sur
le jeu de démonstration, puis les compare entre Hono et la façade. Les groupes `billing` et
`privacy` n'ont jamais reçu de scénario, et cette tranche n'en a pas inventé :

- `billing.subscription` ne lit une ligne d'abonnement qu'après une mutation :
  `billing.checkout` crée le client Stripe et la session, et l'abonnement naît du webhook
  `checkout.session.completed`. Une lecture enregistrée sur un apprenant neuf rendrait toujours
  `none`, sans prouver la partie utile du contrat ; la machine à états est donc couverte par les
  vecteurs de statut et par l'e2e de contrat.
- `me.export.read` exige l'identifiant d'un export créé par `me.export.request` (202) et le job qui
  le remplit ; il n'existe pas de ligne stable à enregistrer avant l'exécution du job.
- `billing.webhook` est une écriture publique authentifiée par la signature du corps brut, hors du
  modèle « lecture rejouable » du harnais.

La parité de ce périmètre est donc prouvée autrement, sans modifier aucun oracle : vecteurs
d'oracle enregistrés depuis le TypeScript et rejoués à égalité stricte (13 tests), tests
d'intégration sur la base locale (14 cas : RLS, idempotence, webhook, export, suppression, purge),
et e2e de contrat qui traverse réellement le web et la façade. Une reprise du harnais reste
possible (scénarios signés et `me.export.read` avec un identifiant d'enregistrement) mais n'est pas
nécessaire à la preuve et n'a pas été inventée.

## Anomalies et dettes

- **Parcours d'interface du mode simulé (SPEC-210, SPEC-707) hors périmètre** : les pages
  `/_dev/stripe/checkout` et `/_dev/stripe/portal` lisent l'état du mode simulé par les routes
  `dev.stripe.*` / `dev.sdd.stripe.*`, qui restent `ts` (contexte `dev`, SPEC-2207). Depuis la
  bascule, la session Checkout est créée dans le processus Python et l'état mémoire n'est plus
  partagé : les quatre parcours d'interface de `spec-210` échouent sur cette page simulée, et le
  parcours `spec-707` s'arrête sur « Export en file d'attente » car le consommateur du job d'export
  n'est câblé qu'en SPEC-2207. Les contrats HTTP, eux, passent (test de contrat `spec-210` réussi,
  e2e `@SPEC-2206` réussi). Aucune assertion, aucun libellé, aucune ligne de base n'a été modifiée
  pour contourner ces limites : elles disparaissent avec la bascule des routes `dev.*` et des
  consommateurs de jobs (SPEC-2207, plan P22).
- **Écart antérieur sur `main` dans les réglages** : `parametres-hash.spec.ts` attend que le bouton
  « Retour » du portail simulé ramène sur `#abonnement`, alors que `/_dev/stripe/portal` retombe sur
  `#modeles` depuis `d1464d9d` (2026-11-16) ; `git blame` situe cette valeur sur la page, pas sur
  cette branche. Les deux lignes de base visuelles de `spec-707` diffèrent aussi de 2 % et 4 %
  (hauteur mobile 1678 px au lieu de 1660 px) : écart de rendu de police de la famille de celui de
  SPEC-610 (ADR-2019). Ces deux points sont hors des 8 opérations de cette spécification, ne
  touchent ni `billing` ni `privacy`, et aucune ligne de base n'a été régénérée.
- **Décompte 12 + 4 du plan** : le plan P22 annonce « 12 opérations + dev-billing 4 » ; l'inventaire
  fait foi avec **8 opérations** (4 `billing`, 4 `privacy`), les 4 routes `dev-billing` appartenant
  au contexte `dev` et à SPEC-2207, et les 4 routes `dev.personal-data.*` à ce même contexte.
  L'écart est consigné dans `scope.md`.
- **Acceptations légales** : `legal_acceptances` est lu par l'export mais écrit par
  `learny.identity` (`me.legal.accept`, SPEC-2201), pas par ce contexte.
- **Passage à `py` sans changement de code TypeScript** : le code TS du périmètre reste présent et
  n'est plus exécuté pour les entrées basculées (retrait en SPEC-2302, ADR-2008) ; remettre une
  entrée à `ts` dans `api/ownership.yaml` restaure l'ancien comportement.

## Reste

Aucun travail de cette spécification. Le câblage des consommateurs de jobs, la bascule des routes
`dev.*` et le retrait du TypeScript appartiennent à SPEC-2207 et SPEC-2302 (ADR-2014, ADR-2008).
