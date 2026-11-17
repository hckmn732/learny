-- SPEC-804 ET-4 — index des requêtes critiques vérifiées par EXPLAIN.
-- Les index existants sont conservés ; ce fichier ne crée que les manquants. `if not exists`
-- garde la migration rejouable ; les créations non bloquantes de production relèvent de SPEC-808.
create index if not exists notion_states_gap_idx
  on public.notion_states (user_id)
  where gap_nature is not null and gap_cleared_at is null;

create index if not exists activities_owner_formation_kind_date_idx
  on public.activities (owner_id, formation_id, kind, for_date);

create index if not exists bricks_owner_formation_purpose_status_idx
  on public.bricks (owner_id, formation_id, purpose, status);

create index if not exists course_sections_course_id_position_idx
  on public.course_sections (course_id, position);

create index if not exists review_logs_user_notion_reviewed_desc_idx
  on public.review_logs (user_id, notion_id, reviewed_at desc);

create index if not exists notifications_user_created_desc_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_partial_idx
  on public.notifications (user_id)
  where read_at is null;
