# SPEC-4001 — Mode simple : backend et contrat

Preuves d'acceptation produites par `node tools/sdd/validate.mjs SPEC-4001` (dernier run
2026-11-24, toutes les étapes vertes). Les rapports détaillés sont dans ce dossier :
`checks.json`, `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `py-unit.xml`,
`py-integration.xml`, `summary.md`, `video/`, `screenshots/`, `visual/`.

## Étapes de validation

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | eslint, prettier, `drizzle-kit check` + miroir Supabase, `contract:check`, `sdk:check`, `python:lint` (ruff + import-linter), `py:contract:check`, `rls:check`, `inventory.mjs --check` |
| typecheck | ✅ | TypeScript de tous les paquets + `mypy` sur 670 fichiers Python |
| build | ✅ | `pnpm build` puis `pnpm test:build` |
| unit | ✅ | 2345 tests Vitest du projet unitaire (0 échec) + 21 tests pytest `[SPEC-4001]` (règles du domaine, détection des sections) |
| integration | ✅ | 4 tests Vitest de contrat `[SPEC-4001]` + 12 tests pytest `[SPEC-4001]` (parcours complet en mock, diagnostic, RLS, consommateurs) |
| e2e | ✅ | 2 tests Playwright `@SPEC-4001`, 3 vidéos |
| visual | ✅ | 1 test `@SPEC-4001 @visual` (mode demo), capture `SPEC-4001-programme-document-desktop-linux.png` |
| acceptance | ✅ | 7/7 critères |

Le contrat est régénéré et vérifié : `api/openapi.yaml` (165 opérations), `api/errors.json`
(111 codes), `api/events.schema.json` (52 événements), `api/inventory.json`,
`api/oracles/vectors/rls-matrix.json`, `packages/api-sdk/src/schema.d.ts`,
`apps/api/src/learny_api/generated/{routes,models}.py`.

## Critères

| Critère | Résultat | Preuve |
|---|---|---|
| CA-1 · un PDF de cours et un PDF de TD déposés, analyse lancée → statut `proposed`, quatre étapes `done`, `chaptersFound` non vides, proposition `source = 'document'` avec `pageFrom`/`pageTo` par module | ✅ | `apps/api/tests/integration/test_simple_mode.py::test_full_flow_mock` (statut `proposed`, quatre étapes `done`, sections détectées par signets, `source = 'document'`, `pageFrom`/`pageTo` sur chaque module) ; `apps/web/e2e/specs/p40/spec-4001.spec.ts` (parcours HTTP complet, `GET /programme` → `source: 'document'`) |
| CA-2 · sans modèle pour une tâche requise, `409 AI_NOT_CONFIGURED`, `details.tasks` liste les tâches manquantes, les documents restent | ✅ | `test_simple_mode.py::test_analysis_refused_without_model` (`details.tasks = [simple_analysis, programme, course]`, sources conservées, statut `collecting` inchangé) ; `spec-4001.spec.ts` (même refus en HTTP) |
| CA-3 · rôle deviné sur « Annales DCG 2023 », « TD corrigés » et un document neutre ; `PATCH …/role` refusé après lancement (`SIMPLE_ANALYSIS_LOCKED`) | ✅ | `python/learny/tests/unit/formation/test_simple_domain.py::test_guess_role_*` (annales/examen/session, td/exercices/travaux dirigés, accents, premier document neutre) ; `test_simple_mode.py::test_role_locked_once_the_analysis_started` (`exam_papers` deviné, corrigé en `course`, puis `SIMPLE_ANALYSIS_LOCKED` après le lancement) |
| CA-4 · après validation, les deux premiers modules non acquis ont un cours `ready`, les suivants `queued`/`generating` ; aucun chapitre ne demande « chapitre terminé » | ✅ | `test_simple_mode.py::test_full_flow_mock` : `chapter_progress.contributions_status = 'done'` pour tous les chapitres, `chapter_sources` remplis, `simple.generation.requested` émis, les deux premiers modules générés directement (`SIMPLE_DIRECT_MODULES = 2`) puis un événement `chapter/contributions-completed` par module restant ; `GET …/simple` renvoie `generation` |
| CA-5 · diagnostic tout juste sur le module 1 : ce module seul est validé, ses notions entrent dans le quiz global ; `check` refusé (`DIAGNOSTIC_NO_CHECK`) ; second diagnostic refusé (`DIAGNOSTIC_ALREADY_DONE`) | ✅ | `test_simple_mode.py::test_diagnostic_acquires_the_right_module` (un seul module `validated`, `notion_states` créés, `DIAGNOSTIC_NO_CHECK`, `DIAGNOSTIC_ALREADY_DONE`) et `test_diagnostic_can_be_skipped` (tentative `abandoned`, rien de validé) ; `spec-4001.spec.ts` (parcours HTTP des réponses, `check` et second diagnostic) |
| CA-6 · échéance fixe → `objectives = ['exam']` et fin de planning 14 jours avant ; la retirer rétablit `['operational']` | ✅ | `test_simple_domain.py::test_deadline_*` ; `test_simple_mode.py::test_deadline_patch` (31/12/2026 → fin 17/12/2026, puis retour à `operational`) et `test_deadline_too_close_is_refused` (`422 VALIDATION_FAILED`) |
| CA-7 · un autre utilisateur ne peut ni lire ni modifier l'analyse, les sources ou le diagnostic d'une formation d'un autre (RLS et service) | ✅ | `test_simple_mode.py::test_rls_other_user` (lecture de l'état et changement de rôle en `NOT_FOUND` pour un autre compte) ; politiques `simple_analyses_owner_all` et `chapter_sources_owner_all` (`packages/db/migrations/0058_simple_mode_rules.sql`), matrice `packages/db/src/rls/matrix.ts`, export `api/oracles/vectors/rls-matrix.json`, rejeu `test_rls_matrix.py` (5 tests) |

## Non-régression

- Les suites existantes touchées par la validation du programme restent vertes : le projet
  Vitest unitaire complet (2345 tests) et les 12 autres fichiers pytest d'intégration exécutés
  n'ont aucun échec.
- Rejeu ciblé des spécifications citées par la section 12 : `apps/web/e2e/specs/p6` et `p7`
  (SPEC-605/607/608/611/618) exécutés lors de la campagne `@SPEC-605` déjà présente dans la
  base ; les fichiers `test_programme.py` et `test_content_uploads.py` du suite pytest
  d'intégration ont été rejoués verts après la modification de la validation du programme.

## Décisions consignées

- ADR-4008 : noms d'événements pointés (`simple.analysis.requested`,
  `simple.generation.requested`) acceptés par `enqueue_event` (migration
  `0059_simple_mode_events.sql`) ; tâche `simple_analysis` dans l'enum et le catalogue mais pas
  dans le sélecteur à cinq tâches, que SPEC-4002 étend.
- Le format DOCX/TXT/Markdown d'EF-2 est accepté au dépôt (URL signée) et lu par un extracteur
  de document ; il n'est pas exercé par les critères, qui portent sur des PDF.
