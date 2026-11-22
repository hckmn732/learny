# Acceptation — SPEC-2205 (domaine Engagement : notifications et automatismes en Python)

Périmètre : **21 opérations** du contexte `engagement` de `api/inventory.json`, le domaine des
notifications (routage, heures calmes, seize gabarits × deux tonalités), la boîte de réception et
ses réglages, les abonnements push, la désinscription, le moteur des dix automatismes, le service de
pause, la revue hebdomadaire et les **quatre cas d'usage de job** du périmètre. Dernier commit de la
branche : voir `git log -1 --format=%H`.

Les chiffres de périmètre viennent de `api/inventory.json` (généré par SPEC-2001) et de
`api/ownership.yaml` ; la matrice complète entrée → cas d'usage → règles → tables → tests est dans
[`parity.md`](./parity.md), la liste cochable des opérations et les couches livrées dans
[`scope.md`](./scope.md), la carte des tests portés dans [`test-port-map.md`](./test-port-map.md).

## CA-1 — Opérations du périmètre à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ✅

- **21 / 21** opérations du contexte `engagement` sont à `py` dans `api/ownership.yaml` (aucune
  restante en `ts`), et `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` a
  toujours un handler : **21 handlers pour 21 opérations `py`**
  (`apps/api-py/src/learny_api/handlers/engagement.py`), aucune route `ts` servie par Python
  (`test_no_ts_operation_is_served_by_python`).
- **Quatre cas d'usage de job portés et testés** : `ensure_practice_exercise` (`jeu-lacune`),
  `plan_daily_digests` et `send_daily_digest` (`notifications-daily-digest`),
  `sync_validation_quiz_reminders` (`notifications-reminders`). Ils vivent dans
  `learny/engagement/application/{practice_exercises,digest,reminders}.py`, sont exposés par
  `learny.engagement.public` et prouvés par les vecteurs de l'oracle
  `tools/engagement/oracle-jobs.mjs` (`tests/fixtures/engagement_jobs.json`), par
  `packages-py/learny/tests/unit/engagement/test_engagement_jobs_domain.py` (**33 cas**) et par
  `packages-py/learny/tests/integration/engagement/test_engagement_jobs.py` (**12 cas**).
  **Le câblage au worker Python (dispatcher, ordonnanceur) relève de SPEC-2207** (ADR-2014,
  ADR-2006) : les cas d'usage sont portés, appelables et testés ici, aucune réponse HTTP n'en dépend.
- Matrice entrée → cas d'usage → règles → tables → tests : section « Matrice » de
  [`parity.md`](./parity.md), une ligne par opération (21 lignes), plus les tableaux du domaine, de
  la plateforme, des jobs et de la bascule dans [`scope.md`](./scope.md).
- Les sept entrées restantes annoncées par le plan P22 (`deliver_notification`,
  `deliver_due_deliveries`, `send_welcome_email`, `expire_due_automation_actions`, et les quatre
  cas d'usage de job) n'ont **aucune entrée HTTP** dans l'inventaire : elles sont portées et testées
  comme cas d'usage, sans opération ni route inventée (ADR-2005).

## CA-2 — Parité contractuelle du périmètre, zéro divergence inexpliquée ✅

- Campagne de clôture exécutée le **2026-11-22 sur le HEAD de la branche** : Hono `:3112` pour
  l'enregistrement, façade `:3101` pour le rejeu, horloge figée au 2026-11-11T12:20:00Z,
  `LLM_MODE=mock`, `EMAIL_MODE=memory`, `PUSH_MODE=mock`, `TZ=UTC`, base non remise à zéro (la
  campagne ne partage aucune transaction avec les suites). Procédure, sorties et analyse :
  [`parity.md`](./parity.md).
- `corepack pnpm parity:record --target http://127.0.0.1:3112 --group engagement` :
  **8 scénarios enregistrés** ; `parity:check` contre la façade : **8 scénarios rejoués à
  l'identique, zéro divergence**. `git status --short api/oracles/recordings/reads.json` est vide
  avant **et** après la campagne : l'oracle de SPEC-2001 est inchangé, aucune ligne de base
  régénérée.
- Rejeu des groupes déjà enregistrés contre la même façade : `identity` **7**, `formation` **2**,
  `learning` **4**, `assessments` **1** — **22 scénarios à l'identique au total, zéro divergence**,
  donc aucune régression de la façade après la bascule des vingt-et-une entrées.
- Les mutations et les routes à paramètre de chemin ne sont pas générées par l'outil : elles sont
  prouvées par les tests d'intégration serveur listés dans le tableau « Ce que la parité générée ne
  couvre pas » de [`parity.md`](./parity.md) (inbox, réglages, push, désinscription, décisions
  accept/decline/undo, pause, journal, revue hebdomadaire) et par l'e2e ci-dessous.

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ✅

- [`test-port-map.md`](./test-port-map.md) : carte cas par cas (fichier TypeScript → fichier
  pytest → nombre de cas → fixture) pour le domaine notifications (routage, heures calmes, seize
  gabarits × deux tonalités), la plateforme e-mail et push, les cas d'usage de la boîte de
  réception, des réglages, des abonnements, de la désinscription, du moteur d'automatismes, de la
  pause, de la revue hebdomadaire et des quatre jobs.
- Les seuls cas sans équivalent sont des états atteignables uniquement avec une transaction factice
  ou un fournisseur réel ; ils sont listés avec leur motif dans `test-port-map.md`.
- Suite Python complète au HEAD `3ddd07ae` (**code Python inchangé depuis** : `git diff 3ddd07ae --
  packages-py apps/api-py` est vide) : **3 408 tests unitaires verts** (dont 2 113 cas étiquetés
  `[SPEC-2205]`) et **465 tests d'intégration verts** (dont 94 étiquetés `[SPEC-2205]`),
  `ruff check`, `ruff format --check`, `mypy` et `lint-imports` verts.
- Aucun test TypeScript du périmètre n'a été supprimé ni affaibli : le code TypeScript reste en
  place (retrait en SPEC-2302, ADR-2008) et ses tests restent verts ; les tests portés ajoutent les
  cas pytest.

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts (1 contrat conservé), contexte `engagement` inclus ; le
  domaine (`learny/engagement/domain/`) ne dépend ni de FastAPI, ni de SQLAlchemy, ni d'un SDK.
- Les handlers `apps/api-py/src/learny_api/handlers/engagement.py` ne contiennent aucune règle : ils
  lisent les modèles générés et appellent un cas d'usage par opération
  (`learny/engagement/public.py`). Aucun handler ne manipule de requête SQL ni de décision métier.
- Les règles vivent dans `learny/engagement/domain/` (routage, heures calmes, gabarits, moteur des
  dix automatismes, résumés, journal, semaines, pause, fenêtres du tick, rappels, exercice
  pratique) ; les requêtes dans `learny/engagement/infrastructure/` ; les adaptateurs sortants
  (e-mail, push, pages de désinscription) dans le contexte et `learny.platform/`, sans règle métier.
- Les écritures internes des balayages système passent par `learny.shared.privileged`, déclaré avec
  sa raison (ADR-2010) ; toute lecture ou écriture d'apprenant s'exécute sous RLS avec les claims de
  la transaction.

## CA-5 — Les e2e du périmètre passent sans modification à travers la façade Python ✅

- `PLAYWRIGHT_REUSE_SERVER=0 pnpm test:e2e --grep "@SPEC-2205\b"` : **2 tests verts**, dont
  **1 test `@visual`** ; rapports `e2e.json` et `e2e.xml`, vidéos, captures et résultats axe dans
  `evidence/SPEC-2205/`.
  - `apps/web/e2e/specs/p22/spec-2205.spec.ts` : session réelle (`createTestSession`), une
    notification semée par la fabrique. `notifications.unreadCount`
    (`GET /api/v1/notifications/unread-count`) répond **200** avec `x-served-by: learny-api` et
    `{"count": 1}` ; `me.notificationSettings.get` (`GET /api/v1/me/notification-settings`) répond
    **200** avec le DTO normalisé complet (canaux `app`/`email`/`browser`, six types, `digestTime`
    08:00, heures calmes `[21:00, 08:00)` franchissant minuit, `weekendQuiet`, `maxPerDay: 5`,
    `activeTypeCount: 6`) ; `notifications.read` (`POST /api/v1/notifications/:id/read`) répond
    **200** avec `{"unreadCount": 0}` et un rejeu renvoie la même réponse sans second effet.
  - Test `@visual` : `axeCheck` sans violation sérieuse ou critique, puis `captureEvidence` desktop
    (1440 × 900) et mobile (390 × 844) de la page `/_dev/sdd/SPEC-2205`, qui annonce **21 / 21**
    opérations servies par Python, la boîte de réception et les réglages, le routage des livraisons
    (heures calmes, plafonds 3 / 5 / 8), les **seize gabarits × deux tonalités**, le moteur des
    **dix définitions** et les **quatre cas d'usage de job** (câblage worker en SPEC-2207).
- Les e2e existants du périmètre passent sans modification à travers la façade ; aucune assertion
  d'oracle ni ligne de base visuelle existante n'a été modifiée (ADR-1001, ADR-2008). Les captures de
  cette spécification sont des preuves, pas des lignes de base
  (`git diff 3ddd07ae -- apps/web/__screenshots__` est vide).

## Contrôles de qualité

Mesures du **2026-11-22** sur la VM de développement (Supabase local, horloge figée au
2026-11-11T12:20:00Z, `LLM_MODE=mock`, `TZ=UTC`) ; les étapes `validate.mjs` sont enregistrées dans
[`checks.json`](./checks.json) avec leur horodatage.

| Contrôle | Commande | Résultat |
|---|---|---|
| Lint Python | `uv run ruff check .` et `uv run ruff format --check packages-py apps` | vert |
| Types Python | `uv run mypy packages-py apps` | vert |
| Import-linter | `uv run lint-imports` | vert |
| Unités Python | `uv run pytest packages-py/learny/tests/unit -q` | vert (dont 2 113 cas `[SPEC-2205]`) |
| Intégration Python | `uv run pytest packages-py/learny/tests/integration -q` | vert (dont 94 cas `[SPEC-2205]`) |
| Contrat Python | `pnpm py:contract:check` | vert (artefacts générés inchangés) |
| Inventaire | `tsx tools/migration/inventory.mjs --check` | vert (217 opérations, 21 `engagement`, aucun `gap`) |
| Lint racine | `pnpm lint` | vert |
| Types racine | `pnpm typecheck` | vert |
| Construction | `pnpm build` | vert |
| Unités TypeScript | `pnpm test:unit` | vert (aucun test TypeScript étiqueté `[SPEC-2205]`, cf. `test-port-map.md`) |
| Intégration TypeScript | `pnpm test:int` | vert |
| e2e du périmètre | `pnpm test:e2e --grep "@SPEC-2205\b"` | vert (2 tests, 1 `@visual`) |
| Validation SDD | `node tools/sdd/validate.mjs SPEC-2205` | 8 étapes vertes : lint, typecheck, build, unit (2 113 pytest), intégration (94 pytest), e2e (2), visuel (1), acceptance (5/5) |
| Parité | `pnpm parity:record|check --group engagement` puis `--check` des quatre autres groupes | vert (8 + 22 scénarios, 0 divergence) |

## Anomalies et décisions

- **Décompte 28 vs 21** : le plan P22 et le titre de la spécification annoncent « 28 opérations » ;
  l'inventaire en contient **21** pour `context == "engagement"`. L'écart de sept unités correspond
  aux cas d'usage appelés par les jobs que le plan nomme explicitement (`deliver_notification`,
  `deliver_due_deliveries`, `send_welcome_email`, `expire_due_automation_actions`,
  `plan_daily_digests`, `send_daily_digest`, `sync_validation_quiz_reminders`), portés ici mais sans
  entrée HTTP dans l'inventaire. L'inventaire fait foi (ADR-2005) ; aucune entrée n'a été inventée.
  Le titre de la page de démonstration et les compteurs sont lus dans l'inventaire, ils affichent
  donc 21.
- **HTML des e-mails** : textes, sujets, tonalités, jetons de couleur et en-têtes `List-Unsubscribe`
  identiques au TypeScript ; la structure DOM n'est pas celle de React Email (tables imbriquées).
  Aucun oracle ne compare ce HTML (ni réponse HTTP, ni page du web) ; l'écart est documenté dans
  [`parity.md`](./parity.md) et les textes sont verrouillés par
  `test_engagement_platform.py`.
- **Identifiant de message déterministe** (`mem_<sha256>`, `smtp_<sha256>`) au lieu d'un UUID
  aléatoire : aucune source aléatoire dans le code métier (ADR-0047), l'identifiant n'apparaît dans
  aucune réponse publique.
- **Tri français des notions à risque** : table de translittération au lieu de `Intl.Collator` pour
  que la locale du processus ne décide pas du résultat (ADR-0047) ; l'ordre est prouvé par les
  vecteurs de l'oracle.
- **Politique de langue** : textes du moteur dans `locale_fr/engagement_automations.py`, contenu de
  l'exercice pratique dans `locale_fr/engagement_exercises.py`, libellés des jobs dans
  `locale_fr/engagement.py` ; sources hors `locale_fr` ASCII (ADR-2011,
  `tests/unit/shared/test_language_policy.py`).
- **Deux défauts latents de `queries.py` corrigés** (tranche notifications) : `AmbiguousParameter`
  sur `:notification_id is null` et `NoSuchColumnError` sur `LOAD_DELIVERY` ; l'intégration exécute
  désormais chaque énoncé.
- **Balayages globaux** : `plan_daily_digests` et `sync_validation_quiz_reminders` lisent tous les
  apprenants, comme les jobs TypeScript ; leurs tests neutralisent les lignes des autres suites
  locales **dans la transaction annulée**, sans écriture hors transaction.
- **Placement de `ensure_practice_exercise`** : cas d'usage du contexte `engagement` (P22) alors que
  le cycle de vie de l'exercice reste dans `assessments` ; aucune duplication, l'exercice créé est lu
  par `assessments`.
- **Aucune assertion d'oracle ni ligne de base régénérée** : `git status --short
  api/oracles/recordings/reads.json` vide après la campagne ; `apps/web/__screenshots__` inchangé.
- Aucun ADR nécessaire : ADR-2015 (dépendances), ADR-2011 (langue), ADR-2008/ADR-1001 (textes) et
  ADR-2010 (rôle de service) couvrent les décisions prises.

## Dettes portées par SPEC-2207 (worker et consommateurs)

- Les quatre cas d'usage de job sont portés, testés et appelables ; le branchement au worker Python
  (dispatcher, ordonnanceur, consommateurs d'événements et crons) arrive en SPEC-2207 (ADR-2014,
  ADR-2006). Aucune réponse HTTP n'en dépend.
- Les consommateurs d'événements `notification/delivery-due`, `user/signed-up` et les crons
  `notifications-daily-digest`, `notifications-deferred-due` et `notifications-reminders` restent
  TypeScript jusqu'à SPEC-2207 ; les événements sont écrits dans `public.event_outbox` dans la
  transaction métier avec leurs identifiants stables, donc un rejeu ne produit ni second effet ni
  second événement.
