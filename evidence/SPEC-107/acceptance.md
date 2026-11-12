# SPEC-107 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0014_memory` et
`0015_memory_rules`), avec l'horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock` et
`DATABASE_URL` local. Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `summary.md`, `sql-constraints.txt`, `sql-plan.txt`, `sql-rls.txt`, `screenshots/`,
`attachments/` (axe) et `video/`.

- ✅ CA-1 — Les trois tables (`notion_states`, `review_logs`, `gap_events`) et leurs quatre
  énumérations (`gap_nature`, `fsrs_grade`, `review_source`, `gap_event_kind`) correspondent à
  `data-model.md` §6 ; les états FSRS invalides, les maîtrises hors [0 ; 100] et les confusions
  incohérentes sont refusés. Preuves :
  `packages/db/src/schema/memory.test.ts` (`[SPEC-107] memory schema` : colonnes, énumérations,
  pk, index partiel, carte FSRS complète/invalide, NaN/Infini, bornes de maîtrise, preuve JSON) ;
  `packages/db/test/integration/memory.test.ts` tests « CA-1 — les trois tables, quatre
  énumérations, contraintes, index, déclencheurs et politiques existent » (SQLSTATE 23514 sur
  `notion_states_mastery_check`, `notion_states_success_count_check`, `notion_states_fsrs_check`,
  `notion_states_gap_confused_not_self_check`, `notion_states_gap_confused_nature_check`,
  `gap_confusion_formation_mismatch`, `notion_states_gap_cleared_at_check`,
  `review_logs_time_ms_check`, `gap_events_nature_check`) ; `sql-constraints.txt` et
  `sql-rls.txt`.
- ✅ CA-2 — La requête `getDueNotionStates` exclut les notions suspendues, non revues, sans échéance
  et celles d'autrui, avec l'ordre stable `due_at, notion_id` ; le plan utilise l'index partiel.
  Preuves : `packages/db/test/integration/memory.test.ts` test « CA-2 / EF-5 / CL-7 / CL-8 —
  notions dues filtrées, ordre stable et index partiel utilisé » (deux notions dues sur cinq,
  suspension et `in_review=false` exclues, `due_at` identique en `America/New_York`, `EXPLAIN`
  contenant `notion_states_due_idx`) ; `sql-plan.txt` (`Index Scan using notion_states_due_idx`,
  `Index Cond` sur `user_id` et `due_at`) ; test RLS « CL-5 / CL-6 » (lecture d'une notion
  d'autrui vide).
- ✅ CA-3 — Révision, état courant et événement de lacune sont atomiques ; deux réponses
  concurrentes ne s'écrasent pas. Preuves : `packages/db/test/integration/memory.test.ts` test
  « CA-3 / ET-5 / CL-3 — deux réponses concurrentes ne s'écrasent pas et une seule applique »
  (deux transactions réelles : une réussite, un `CONFLICT` ; révision 1, une seule ligne
  `review_logs` ; rejeu du perdant : révision 2, deux journaux, `due_at` jamais rétrogradé par
  écrasement) et test « CA-3 / CL-1 — état, journal et événement sont atomiques » (un journal en
  échec ramène `revision` et `mastery` à 0 sans orphelin ; un événement en échec ne laisse ni
  nature ni événement).
- ✅ CA-4 — L'historique conserve la version avant/après et l'état courant reflète le dernier
  événement ; le journal est append-only. Preuves :
  `packages/db/test/integration/memory.test.ts` test « CA-4 / EF-4 / CL-4 — l'historique garde
  avant/après, la levée est idempotente et l'état suit le dernier événement » (carte avant
  `reps 0` puis après `reps 1` avec stabilité et difficulté, événements `detected`,
  `nature_changed`, `cleared`, seconde levée sans second événement, 23514
  `review_log_immutable` et `gap_event_immutable`) ; test « CL-5 / CL-6 » (`answer_id` mis à null
  par la cascade, mesures conservées) ; `sql-constraints.txt` (déclencheurs
  `review_logs_append_only`, `gap_events_append_only`).
- ✅ CA-5 — La page SDD `/_dev/sdd/SPEC-107` affiche échéance, lacune et historique, passe axe,
  produit une vidéo et les captures desktop/mobile. Preuves :
  `apps/web/e2e/specs/p1/spec-107.spec.ts` test « inspecte les états de mémorisation @SPEC-107 »
  (trois cartes, deux notions dues, quatre natures dont `confusion` active, preuve JSON,
  deux révisions avant/après, absence de l'état de l'autre compte) et test « mémoire conforme
  @SPEC-107 @visual @mobile » (jetons, structure, axe, région défilante à 390 px) ; lignes de base
  `apps/web/e2e/__screenshots__/p1/spec-107.spec.ts/spec-107-memory-desktop-linux.png` et
  `…-mobile-linux.png` (≤ 1 %) ; `e2e.json` (3 tests réussis, 6 vidéos),
  `attachments/*-axe.json` (aucune violation serious/critical), `screenshots/` et `video/`.
