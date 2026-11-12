# SPEC-105 — critères d'acceptation

- ✅ CA-1 — Les huit tables (`courses`, `course_sections`, `course_section_revisions`, `citations`,
  `reading_progress`, `chapter_summaries`, `tutor_conversations`, `tutor_messages`), les trois
  énumérations (`course_status`, `section_kind`, `citation_media`), l'index partiel unique
  `courses_one_current_idx`, les contraintes nommées et les déclencheurs (`courses_single_current`,
  `course_sections_revision`, les cinq `owner_consistency`, `tutor_messages_touch_conversation`,
  `set_updated_at`) existent, avec la RLS activée sur les huit tables. Preuves : test d'intégration
  « CA-1 — les 8 tables, 3 énumérations, contraintes, index et déclencheurs existent »
  (introspection `pg_class`, `pg_enum`, `pg_constraint`, `pg_indexes`, `pg_trigger`) ;
  `packages/db/migrations/0010_courses_conversations.sql`, `0011_courses_rules.sql` ;
  `evidence/SPEC-105/integration.json` et `checks.json`.
- ✅ CA-2 — Une seule version courante par `(owner_id, module_id)` : insérer la version 2 bascule la
  version 1 à `is_current = false` sans la supprimer, deux insertions concurrentes se sérialisent sur
  le verrou de ligne et laissent la seule version 2 courante, et une promotion forcée de deux lignes
  dans la même instruction est refusée par l'index partiel (`23505`). Preuves : tests d'intégration
  « CA-2 — insérer une version courante bascule la précédente (EF-1, EF-2) », « CL-2 — deux
  promotions courantes dans la même instruction sont refusées (23505) » et « CL-1 — deux insertions
  concurrentes laissent une seule version courante » (deux transactions réelles, attente du verrou
  vérifiée) ; carte « Versions du cours » du test e2e (v1 non courante, v2 courante) ;
  `evidence/SPEC-105/integration.json`.
- ✅ CA-3 — Corriger trois fois une section crée trois révisions (versions 1, 2, 3) et porte la
  section courante en version 4 ; `learny.actor = 'learner'` renseigne `edited_by`, l'absence de
  variable vaut `tutor`, et `reported` change sans révision. Preuves : tests d'intégration
  « CA-3 / CL-4 — trois corrections archivent trois révisions et incrémentent la version » et
  « CA-3 — sans acteur de session, une correction est attribuée au tuteur » ; carte « Révisions
  d'une section » du test e2e (deux révisions, version courante 3) ;
  `evidence/SPEC-105/integration.json`.
- ✅ CA-4 — Les citations survivent à la suppression de leur source : la suppression logique de la
  ressource efface ses passages et met `chunk_id` à nul en conservant le libellé, la suppression
  physique met aussi `resource_id` à nul ; la citation reste présente. Preuves : test d'intégration
  « CA-4 / CL-5 — les citations survivent à la suppression de leur source » (citation conservée,
  `chunk_id` nul, `resource_id` nul) ; carte « Citation après suppression » du test e2e
  (« source supprimée », passage nul) ; `evidence/SPEC-105/integration.json` et
  `evidence/SPEC-105/screenshots/`.
- ✅ CA-5 — Les contraintes sont appliquées : ancre hors expression (`Postes-Et-Cles`,
  `postes_et_cles`, `-debut`) et ancre dupliquée (`23514`/`23505`), position nulle, `percent = 101`,
  `seconds_spent = -1`, résumé de 2 001 caractères, message vide, libellé vide, et cohérence
  propriétaire (`owner_mismatch`, `23514`) sur sections, citations, messages, résumés et progressions.
  Preuves : tests unitaires « accepte les ancres conformes et refuse les autres (EF-3, CL-3) » et
  schémas JSON ; test d'intégration « CA-5 — ancres, pourcentages, longueurs et cohérence
  propriétaire sont imposés » ; `evidence/SPEC-105/unit.json` et `integration.json`.
- ✅ CA-6 — Les cascades sont conformes : supprimer le module supprime ses deux versions de cours,
  leurs sections, révisions, citations, progressions, résumés, discussions et messages, ainsi que la
  ressource et ses passages ; supprimer une discussion supprime uniquement ses messages et conserve
  l'autre discussion (« Nouvelle discussion »). Preuve : test d'intégration
  « CA-6 / CL-8 — la cascade du module efface cours, sections, citations et discussions » ;
  `evidence/SPEC-105/integration.json`.
- ✅ CA-7 — La page `/_dev/sdd/SPEC-105` est filmée et le test visuel réussit : 2 tests e2e
  `@SPEC-105` réussis, 4 vidéos collectées dans `evidence/SPEC-105/video/`, 1 test `@visual` réussi
  (mode `demo`), capture de référence
  `apps/web/e2e/__screenshots__/p1/spec-105-courses.spec.ts/spec-105-demo-desktop-linux.png`.
  Preuves : `evidence/SPEC-105/e2e.json`, `checks.json`, `video/` et `screenshots/`.

## Non-régression

- `lint` (dont `db:check` et le miroir des 12 migrations), `typecheck` et `build` réussis sur tout le
  monorepo ; la suite unitaire complète reste verte (30 fichiers, 420 tests) ; les suites
  d'intégration `[SPEC-101]` (10 tests), `[SPEC-102]` (11), `[SPEC-103]` (13) et `[SPEC-104]` (10)
  restent vertes. Voir `evidence/SPEC-105/checks.json`.
