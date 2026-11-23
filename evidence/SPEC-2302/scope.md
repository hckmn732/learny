# SPEC-2302 — Périmètre livré et démos différées

Branche : `spec/SPEC-2302-retrait-backend-typescript` (worktree `../learny-wt-SPEC-2302`), base
`main` = `f240053a`. Tranche arrêtée par le porteur à **55/70 opérations `dev.*` servies par
Python** ; les 15 restantes sont `ts` et documentées ci-dessous.

## 1. Résultat

| Mesure | Valeur |
| --- | --- |
| Opérations `dev.*` du contrat | 70 |
| Servies par la façade Python (`ownership.yaml: py`) | **55** |
| Encore relayées vers Hono (`ts`) | **15** |
| Démos portées par cette tranche | **11** |
| Entrées non-`dev` encore `ts` | 1 (`home.get`, hors périmètre de cette tranche) |

`CA-4` (« aucune opération servie par TypeScript ») n'est **pas** satisfait : voir `blockers.md`.

## 2. Démos portées par cette tranche (11)

| Route | Fichier Python | Preuve d'intégration |
| --- | --- | --- |
| `dev.sdd.spec-009.demo` | `dev_demos/sdd_config.py` | `test_dev_sdd_config.py` (nominal + aucune valeur secrète + garde 404) |
| `dev.sdd.spec-103.demo` | `dev_demos/sdd_records.py` | `test_dev_sdd_records.py` (arbre, 7 contraintes, plan FTS) |
| `dev.sdd.spec-104.demo` | `dev_demos/sdd_records.py` | idem (passages, recherche vectorielle, suppression logique) |
| `dev.sdd.spec-105.demo` | `dev_demos/sdd_records.py` | idem (versions, révisions, citation supprimée, messages) |
| `dev.sdd.spec-106.demo` | `dev_demos/sdd_records.py` | idem (13 briques, activité, tentative notée) |
| `dev.sdd.spec-107.demo` | `dev_demos/sdd_records.py` | idem (états, historique, lacune, isolation) |
| `dev.sdd.spec-108.demo` | `dev_demos/sdd_records.py` | `test_dev_sdd_records_lot2.py` (statuts, action, activité, jalons) |
| `dev.sdd.spec-111.demo` | `dev_demos/sdd_records.py` | idem (code, capacité, progression, compteur) |
| `dev.sdd.spec-112.demo` | `dev_demos/sdd_records.py` | idem (recherche sous JWT, exports, acceptations, idempotence) |
| `dev.sdd.spec-113.demo` | `dev_demos/sdd_records.py` | idem (catalogue, matrice RLS à trois JWT) |
| `dev.sdd.spec-115.demo` | `dev_demos/sdd_records.py` | idem (jeu de démonstration mesuré, cas « seed absente ») |

Socle introduit : `packages-py/learny/src/learny/shared/devfixtures.py` (fabriques de production
sous garde de dev, transaction toujours annulée, déclarées dans `privileged.py`), `support.probe`,
`support.sqlstate_of`/`failure_message`/`raised_code`, textes dans `locale_fr/dev_sdd_fixtures.py`.

Les 44 autres opérations `dev.*` déjà `py` proviennent de SPEC-2207 (voir
`evidence/SPEC-2207/handover.md` §5, §7, §7 bis, §9) et restent inchangées.

## 3. Démos différées (15)

| Route | Justification (cas d'usage TS à porter) |
| --- | --- |
| `dev.sdd.spec-411.demo` | `loadSpec411Demo` (`spec-411.ts`) compose une tentative réellement notée (activité, brique, réponses, lacunes) puis lit l'outbox et les créneaux : fixture de notation complète. |
| `dev.sdd.spec-501.create` | `createDemoBrick` (`spec-501.ts`) appelle `createBrick` (`packages/services/src/bricks/brick-service.ts:167`), absent de `learny.assessments.application`. |
| `dev.sdd.spec-501.report` | `reportDemoBrick` (`spec-501.ts`) puis `getPublicBrick` (`brick-service.ts:391`, projection publique de version), absent. |
| `dev.sdd.spec-501.correct` | `correctDemoBrick` (`spec-501.ts`) puis `getPublicBrick` ; `correct_brick` existe, la relecture publique manque. |
| `dev.sdd.spec-504.demo` | `loadResolutionDemo` (`spec-504.ts`) et `resolveModel` (`packages/llm/src/resolve.ts:29`) : table de résolution BYOK / modèle par tâche absente. |
| `dev.sdd.spec-504.call` | `runMockCall` (`spec-504.ts`), `resolveModel` et `createSession` (`packages/llm/src/session.ts:159`). |
| `dev.sdd.spec-508.demo` | `buildTutorDemo` (`packages/tutor/src/demo.ts`), service de 487 lignes composant sept étapes du tuteur. |
| `dev.sdd.spec-509.demo` | `loadSpec509Demo` (`spec-509.ts`) : deux ingestions réelles et un échec + reprise, fixtures ressource/passages/vecteurs. |
| `dev.sdd.spec-510.demo` | `loadSpec510Demo` (`spec-510.ts`) : extraction et découpage réels (web, YouTube, vision simulée). |
| `dev.sdd.spec-511.demo` | `loadSpec511Demo` (`spec-511.ts`) : retrieval déterministe, deux élèves du même groupe, quatre budgets. |
| `dev.sdd.spec-512.demo` | `loadSearchWebDemo` (`spec-512.ts`), `searchWeb` (`packages/tutor/src/tools/search-web.ts:156`) et `createProviderSearch`, schéma JSON du contrat. |
| `dev.sdd.spec-512.suggest` | `suggestSpec512` (`implementations/dev-sdd.ts`) et `suggestResource` (`packages/tutor/src/services/resource-suggestions.ts:85`). |
| `dev.sdd.spec-512.decide` | `decideSpec512` et `decideResourceSuggestion` (`resource-suggestions.ts:161`). |
| `dev.sdd.spec-711.demo` | `loadSpec711Demo` (`spec-711.ts`) : moteur `runAutomation`/`acceptAutomationAction`/`undoAutomationAction` et registre factice du harnais `@learny/automations`. |
| `dev.sdd.spec-1301.demo` | `runNativeClientScenario` (`packages/testing/src/native-client`) : harnais de client natif (HTTP réel + modèle préparé), pas une route métier. |

## 4. Commits

| SHA | Contenu |
| --- | --- |
| `436a8900` | `feat(SPEC-2302)` : `devfixtures` + démos 103 à 107, bascule `ownership.yaml`, tests d'intégration. |
| `38b8098f` | `feat(SPEC-2302)` : démos 108, 111, 112, 113, 115 (dont adhésion du propriétaire dans `create_group`). |
| `56297b2d` | `feat(SPEC-2302)` : démo 009 (configuration serveur). |
| (ce commit) | `docs(SPEC-2302)` : `scope.md` et `blockers.md`. |

## 5. Preuves exécutées

| Commande | Résultat |
| --- | --- |
| `uv run ruff check packages-py apps/api-py/src` | vert |
| `uv run ruff format --check packages-py apps/api-py/src` | vert (596 fichiers) |
| `uv run mypy packages-py apps` | vert (643 fichiers) |
| `uv run pytest apps/api-py/tests/unit -q` | 172 passés |
| `uv run pytest tests/integration/dev/test_dev_sdd_records.py` | 10 passés |
| `uv run pytest tests/integration/dev/test_dev_sdd_records_lot2.py` | 10 passés |
| `uv run pytest tests/integration/dev/test_dev_sdd_config.py` | 3 passés |

Campagne e2e ciblée (`spec-009`, `spec-103` à `spec-115`, projet desktop) : lancée puis interrompue
sur consigne de clôture du porteur ; **aucun résultat exploitable**, à rejouer avant `validate.mjs`.

## 6. Reste à faire

1. Porter par coût croissant : `509`/`510`/`511` (cas d'usage `content` déjà portés), puis `711`,
   `411`, `504` (`resolve_model`), `501` (`bricks.create`/`getPublicBrick`), `512`.
2. Différer `1301` et, si le budget l'exige, `508`, avec la même table.
3. Rejouer les e2e des pages concernées, puis `validate.mjs` / `complete.mjs` (non lancés ici).
