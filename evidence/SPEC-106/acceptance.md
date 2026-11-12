# SPEC-106 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0012_bricks_activities`
et `0013_bricks_activities_rules`), avec l'horloge figée au 2026-11-11T12:20:00Z et `LLM_MODE=mock`.
Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `summary.md`,
`sql-constraints.txt`, `sql-rls.txt`, `screenshots/`, `video/`.

- ✅ CA-1 — Les six tables (`bricks`, `brick_versions`, `brick_reports`, `activities`, `attempts`,
  `answers`) et leurs huit énumérations correspondent à `data-model.md` §5 ; les versions et
  positions en double sont refusées. Preuves :
  `packages/db/src/schema/bricks-activities.test.ts` (`[SPEC-106] brick schema`, colonnes et valeurs
  d'énumération, items, scores, empreintes) ; `packages/db/test/integration/bricks-activities.test.ts`
  tests « CA-1 — les six tables, huit énumérations, contraintes, index, déclencheurs et politiques
  existent », « CA-1 / CL-1 / CL-2 — versions immuables, numéro 0 et doublons refusés, empreinte
  indexée » et « CA-1 / EF-3 / EF-5 — contraintes de positions et de bornes » (23505 sur
  `brick_versions_brick_id_version_unique`, `attempts_activity_id_user_id_attempt_no_unique`,
  `answers_attempt_id_position_unique` ; 23514 sur les versions et positions invalides) ;
  `sql-constraints.txt`.
- ✅ CA-2 — Une activité `ready` contenant une brique signalée, retirée, absente, d'un autre
  propriétaire ou d'une autre formation est refusée sans écriture partielle. Preuves :
  `packages/db/src/schema/bricks-activities.test.ts` (`activityItemsErrors` : liste non vide,
  identifiants UUID, points bornés) ; `packages/db/test/integration/bricks-activities.test.ts` test
  « CA-2 / CL-3 — une activité prête refuse une brique signalée, étrangère, absente ou d'une autre
  formation » (messages `activity_item_status`, `activity_item_owner_mismatch`,
  `activity_item_version_mismatch`, `activity_item_version_missing`,
  `activity_item_formation_mismatch` ; compte d'activités inchangé et statut `draft` conservé après
  refus) ; `sql-constraints.txt` (fonction `assert_activity_items_owned` et déclencheur
  `activities_ready_items`).
- ✅ CA-3 — Une tentative garde ses `brick_version_id` après publication d'une nouvelle version ;
  scores et durées hors bornes échouent. Preuves :
  `packages/db/test/integration/bricks-activities.test.ts` tests « CA-3 / CL-5 / EF-6 — une réponse
  garde sa version après publication d'une nouvelle version » (versions 1 à 4, réponses figées sur
  1, 2 et 3 ; `getAttemptWithAnswers` relit la version exacte), « CA-3 — une tentative exige une
  activité prête et un numéro unique » et « CA-1 / EF-3 / EF-5 » (`attempts_score_check`,
  `attempts_duration_ms_check`, `answers_score_check`, `answers_score_max_score_check`,
  `answers_time_ms_check`) ; `apps/web/e2e/specs/p1/spec-106.spec.ts` (versions de réponse 1, 2, 3
  et mention « version 4 publiée », score 50 sur 100) ; `screenshots/` et `video/`.
- ✅ CA-4 — Deux utilisateurs ne peuvent ni lire ni écrire les lignes de l'autre avec `userDb`.
  Preuve : `packages/db/test/integration/bricks-activities.test.ts` test « CA-4 / CL-8 — deux JWT
  distincts ne lisent ni n'écrivent les lignes de l'autre (userDb) » exécuté avec deux appels réels à
  `userDb({ userId })` : comptes propres à 1 sur les six tables, lectures étrangères à 0, insertion
  d'une brique au nom d'autrui refusée en `42501`, mise à jour et suppression étrangères sans ligne
  retournée, réponse rattachée à la tentative d'autrui refusée en `42501`. Preuve SQL :
  `sql-rls.txt` (six politiques propriétaire et RLS active).
- ✅ CA-5 — La page SDD montre types, activité, tentative et réponses, passe axe, vidéo et capture
  desktop/mobile. Preuves : `apps/web/e2e/specs/p1/spec-106.spec.ts` tests « inspecte les briques et
  tentatives @SPEC-106 » (13 types, 3 items ordonnés, tentative numéro 1 `graded`, 3 réponses figées)
  et « schéma des briques conforme @SPEC-106 @visual @mobile » (jetons, structure, axe, captures
  `spec-106-schema-desktop-linux.png` et `spec-106-schema-mobile-linux.png`, région défilante à
  390 px) ; `e2e.json` (3 tests réussis, 6 vidéos), `visual` (2 tests `@visual`), `attachments/`
  (résultats axe desktop/mobile), `screenshots/` et `video/`.
