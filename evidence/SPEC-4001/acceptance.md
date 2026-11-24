# SPEC-4001 — Mode simple : backend et contrat

Preuves d'acceptation. Les rapports détaillés (`unit.json`, `integration.json`, `e2e.json`,
`py-unit.xml`, `py-integration.xml`, `checks.json`) sont produits par `node tools/sdd/validate.mjs
SPEC-4001` dans ce même dossier.

## Commandes rejouées

- `pnpm -s lint` (eslint, prettier, `drizzle-kit check`, `contract:check`, `sdk:check`, `py:lint`,
  `py:contract:check`, `rls:check`, `inventory.mjs --check`).
- `pnpm -s typecheck` (TypeScript de tous les paquets, `mypy` 666 fichiers Python).
- `pnpm -s build` puis `pnpm -s test:build`.
- `uv run pytest` sur les fichiers étiquetés `[SPEC-4001]`.
- `pnpm -s test:e2e --grep "@SPEC-4001"` (Playwright, vidéo, `LLM_MODE=mock`,
  `JOBS_MODE=inline`).

## Critères

| Critère | Résultat | Preuve |
|---|---|---|
| CA-1 · un PDF de cours et un PDF de TD déposés, analyse lancée → statut `proposed`, quatre étapes `done`, `chaptersFound` non vides, proposition `source = 'document'` avec `pageFrom`/`pageTo` par module | ✅ | `test_simple_mode.py::test_full_flow_mock` (statut, étapes, sections, `source = 'document'`, plages de pages de chaque module) ; `spec-4001.spec.ts` (parcours HTTP complet) |
| CA-2 · sans modèle pour une tâche requise, `409 AI_NOT_CONFIGURED`, `details.tasks` liste les tâches manquantes, les documents restent | ✅ | `test_simple_mode.py::test_analysis_refused_without_model` (`tasks = [simple_analysis, programme, course]`, sources conservées) ; `spec-4001.spec.ts` |
| CA-3 · rôle deviné sur « Annales DCG 2023 », « TD corrigés » et un document neutre ; `PATCH …/role` refusé après lancement (`SIMPLE_ANALYSIS_LOCKED`) | ✅ | `test_simple_domain.py::test_guess_role_*` ; `test_simple_mode.py::test_role_locked_once_the_analysis_started` |
| CA-4 · après validation, les deux premiers modules non acquis ont un cours `ready`, les suivants `queued`/`generating` ; aucun chapitre ne demande « chapitre terminé » | ✅ | `test_simple_mode.py::test_full_flow_mock` (`chapter_progress.contributions_status = 'done'` pour tous, `chapter_sources` remplis, deux modules générés directement puis un événement `chapter/contributions-completed` par module restant) |
| CA-5 · diagnostic tout juste sur le module 1 : ce module seul est validé, ses notions entrent dans le quiz global ; `check` refusé (`DIAGNOSTIC_NO_CHECK`) ; second diagnostic refusé (`DIAGNOSTIC_ALREADY_DONE`) | ✅ | `test_simple_mode.py::test_diagnostic_acquires_the_right_module` (un module validé, notions dans `notion_states`, deux codes d'erreur) et `test_diagnostic_can_be_skipped` ; `spec-4001.spec.ts` |
| CA-6 · échéance fixe → `objectives = ['exam']` et fin de planning 14 jours avant ; la retirer rétablit `['operational']` | ✅ | `test_simple_domain.py::test_deadline_*` ; `test_simple_mode.py::test_deadline_patch` (2026-12-31 → fin 2026-12-17) et `test_deadline_too_close_is_refused` |
| CA-7 · un autre utilisateur ne peut ni lire ni modifier l'analyse, les sources ou le diagnostic d'une formation d'un autre (RLS et service) | ✅ | `test_simple_mode.py::test_rls_other_user` (lecture et changement de rôle en `NOT_FOUND`) ; politiques `simple_analyses_owner_all` et `chapter_sources_owner_all` dans `0058_simple_mode_rules.sql`, matrice RLS et `api/oracles/vectors/rls-matrix.json` |
