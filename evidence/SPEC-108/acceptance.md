# SPEC-108 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0016_planning` et
`0017_planning_rules`), avec l'horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock` et
`DATABASE_URL` local. Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `summary.md`, `sql-constraints.txt`, `sql-concurrency.txt`, `sql-rls.txt`,
`screenshots/`, `attachments/` (axe), `video/` et `baselines.md`.

- ✅ CA-1 — Les quatre tables (`schedule_slots`, `automation_actions`, `daily_activity`,
  `milestones`), leurs cinq énumérations propres (`slot_kind`, `slot_status`, `slot_creator`,
  `automation_status`, `milestone_key`) et la réutilisation de `automation_key` (SPEC-102)
  correspondent à `data-model.md` §7 ; les cinq statuts de BR-AGE-04 sont représentables et une
  plage invalide est rejetée. Preuves :
  `packages/db/src/schema/planning.test.ts` (`[SPEC-108] planning schema` : énumérations, colonnes,
  contraintes, index partiel des successeurs, unique `nulls not distinct`, fenêtre, jour civil,
  résumé sur une ligne, charges JSON et sources) ; `packages/db/test/integration/planning.test.ts`
  tests « CA-1 — les quatre tables, cinq énumérations, contraintes, index, déclencheurs et
  politiques existent » (types `timestamptz`/`date`, défaut SQL absent sur `day`, index DESC,
  politique par table) et « CA-1 / CL-1 — plage invalide, titre vide, minutes négatives et résumé
  multiligne refusés » (SQLSTATE 23514 sur `schedule_slots_window_check`,
  `schedule_slots_title_length_check`, `daily_activity_minutes_check`,
  `daily_activity_sources_check`, `automation_actions_summary_check`,
  `automation_actions_payload_check`, `automation_actions_pending_consent_check`,
  `automation_actions_declined_decided_at_check` ; 23503 sur une origine absente) ;
  `sql-constraints.txt` (contraintes, index et déclencheurs réels).
- ✅ CA-2 — Un déplacement crée un successeur relié par `moved_from_id`, passe l'origine en
  `moved` dans la même transaction et interdit un second successeur actif sous concurrence ; un
  créneau fait, annulé ou déjà déplacé ne bouge plus. Preuves :
  `packages/db/test/integration/planning.test.ts` test « CA-2 / EF-2 / CL-3 — un déplacement
  conserve le lien, un créneau terminé ne bouge plus » (propriétaire, formation, module et titre
  conservés, lien affiché, `CONFLICT` sur `moved`/`done`/`cancelled`, refus SQL
  `schedule_slot_move_origin_not_moved`, 23503 à la suppression de l'origine) et test
  « CA-2 / CL-2 — deux déplacements concurrents ne créent qu'un seul successeur actif » (deux
  transactions réelles : une réussite, un `CONFLICT`, une origine `moved`, un successeur
  `planned`) ; `sql-concurrency.txt` (1 réussite, 1 conflit, 1 successeur actif) et
  `sql-constraints.txt` (`schedule_slots_moved_from_active_unique` partiel, FK auto-référente
  `on delete no action`, déclencheur `schedule_slots_move_consistency`).
- ✅ CA-3 — Une activité quotidienne et un jalon ne sont pas doublés après relecture du même
  événement ; deux écritures distinctes du même jour additionnent leurs minutes et dédupliquent
  les sources. Preuves : `packages/db/test/integration/planning.test.ts` test « CA-3 / EF-4 /
  CL-5 — l'activité du jour et les jalons ne sont pas doublés » (rejeu 30 + 0, sources uniques,
  ajout de 20 puis 5, cinq statuts de jalon, `achieved_at` d'origine conservé, 23505 sur
  `milestones_user_id_key_ref_id_unique` y compris pour `streak_30` à référence nulle) et test
  « CA-3 / CL-5 — deux écritures concurrentes du même jour additionnent sans perte » (10 + 15 =
  25 minutes, sources `attempt:a` et `attempt:b`, rejeu sans ajout) ;
  `sql-constraints.txt` (`UNIQUE NULLS NOT DISTINCT (user_id, key, ref_id)`,
  `daily_activity_minutes_check`, `daily_activity_sources_check`).
- ✅ CA-4 — Un utilisateur ne lit ni n'écrit les créneaux, actions, activités et jalons d'un autre,
  y compris lorsque les deux partagent une formation ; les décisions restent possibles sur ses
  propres actions. Preuves : `packages/db/test/integration/planning.test.ts` test « CA-4 / CL-7 —
  deux JWT ne voient ni n'écrivent les lignes de l'autre, même en formation partagée » (lectures
  filtrées, créneau personnel de Bob sur la formation d'Alice invisible, `listScheduleSlots` et
  `listMilestones` avec l'identifiant de Bob vides, SQLSTATE 42501 pour les écritures croisées,
  acceptation de sa propre action, mise à jour de l'action de Bob sans ligne) ; `sql-rls.txt`
  (transcription réelle des mêmes contrôles : 1 ligne visible contre 0 pour l'autre compte,
  SQLSTATE 42501) et `sql-constraints.txt` (politiques `schedule_slots_owner_all`,
  `automation_actions_owner_select`/`_update`, `daily_activity_owner_all`,
  `milestones_owner_select`).
- ✅ CA-5 — La démonstration `/_dev/sdd/SPEC-108` présente les quatre régions « Créneaux » (créneau
  prévu, prédécesseur déplacé et lien), « Action du tuteur » (statut et consentement), « Activité
  du jour » (45 minutes) et « Jalons », passe axe, produit une vidéo et les captures
  desktop/mobile. Preuves : `apps/web/e2e/specs/p1/spec-108.spec.ts` test « inspecte le schéma du
  planning @SPEC-108 » (cinq statuts en libellés français, cinq créneaux dont le lien
  « Déplacé depuis le 11/11/2026 18:00 », action en attente d'accord et sa charge JSON, 45 minutes
  et sources dédupliquées, deux jalons dont la série à référence nulle) et test « planning conforme
  @SPEC-108 @visual @mobile » (jetons, structure, axe, région défilante à 390 px) ; lignes de base
  `apps/web/e2e/__screenshots__/p1/spec-108.spec.ts/spec-108-planning-desktop-linux.png` et
  `…-mobile-linux.png` (≤ 1 %) ; `e2e.json` (3 tests réussis, 6 vidéos),
  `attachments/*-axe.json` (aucune violation serious/critical), `screenshots/`, `video/` et
  `baselines.md` (ligne de base SPEC-101 régénérée pour les deux migrations ajoutées).
