-- Contraintes, RLS et déclencheurs de SPEC-105 (ET-3, ADR-0112, ADR-0113, ADR-0239).
-- Migration personnalisée appliquée après la migration générée `courses_conversations` : RLS,
-- `set_updated_at`, bascule de la version courante, archive des corrections de section, cohérence
-- du propriétaire et horodatage des discussions. Ne jamais modifier après fusion : ajouter une
-- migration.

-- RLS activée dès la création (ADR-0112) : sans politique, seul le propriétaire (serviceDb) accède
-- aux lignes ; SPEC-113 ajoutera les politiques nommées.
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.course_section_revisions enable row level security;
alter table public.citations enable row level security;
alter table public.reading_progress enable row level security;
alter table public.chapter_summaries enable row level security;
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;

-- updated_at maintenu par la fonction partagée (SPEC-101, EF-5).
create trigger set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.course_sections
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reading_progress
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tutor_conversations
  for each row execute function public.set_updated_at();

-- EF-1 / CL-1 : insérer une version courante bascule les autres versions du même cours. Le
-- déclencheur n'agit qu'à l'insertion : une promotion explicite de deux lignes dans la même
-- instruction reste refusée par l'index partiel `courses_one_current_idx` (CL-2, ADR-0239).
create or replace function public.switch_current_course_version() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
begin
  if tg_op = 'INSERT' then
    update public.courses
    set is_current = false
    where owner_id = new.owner_id
      and module_id = new.module_id
      and id <> new.id
      and is_current;
  end if;
  return new;
end $$;

create trigger courses_single_current
  before insert or update of is_current on public.courses
  for each row when (new.is_current)
  execute function public.switch_current_course_version();

-- EF-4 / CL-4 : toute correction de `title`, `content_md` ou `data` archive l'état précédent dans
-- `course_section_revisions` puis incrémente `version`. `reported` peut changer sans révision.
-- Le service positionne `set local learny.actor = 'learner'` pour une correction de l'apprenant ;
-- `tutor` est la valeur par défaut. Security definer : l'archive est maintenue par le système et
-- reste possible quand SPEC-113 restreint l'écriture des sections au propriétaire.
create or replace function public.archive_course_section_revision() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_actor public.actor;
begin
  if new.title is distinct from old.title
     or new.content_md is distinct from old.content_md
     or new.data is distinct from old.data then
    v_actor := coalesce(
      nullif(current_setting('learny.actor', true), ''),
      'tutor'
    )::public.actor;

    insert into public.course_section_revisions (
      section_id, owner_id, version, title, content_md, data, edited_by
    )
    values (old.id, old.owner_id, old.version, old.title, old.content_md, old.data, v_actor);

    new.version := old.version + 1;
  end if;
  return new;
end $$;

create trigger course_sections_revision
  before update on public.course_sections
  for each row execute function public.archive_course_section_revision();

-- EF-4 bis (ADR-0239) : `reported` change sans créer de révision, donc un signalement ne doit pas
-- être pris pour une correction de contenu.
revoke execute on function public.archive_course_section_revision() from public, anon, authenticated;

-- EF-7 / CL-7 : une ligne de domaine ne peut pas désigner un propriétaire différent de celui de son
-- parent. La fonction est générique et paramétrée par TG_ARGV :
--   [table parente, colonne propriétaire du parent, colonne de clé étrangère, colonne propriétaire].
-- Une clé étrangère nulle est ignorée (résumé ou progression non rattachés à une version).
create or replace function public.assert_same_owner() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_parent_owner uuid;
  v_fk uuid;
  v_owner uuid;
  v_rows integer;
begin
  v_fk := nullif(to_jsonb(new) ->> tg_argv[2], '')::uuid;
  if v_fk is null then
    return new;
  end if;

  execute format('select %I from public.%I where id = $1', tg_argv[1], tg_argv[0])
    into v_parent_owner
    using v_fk;
  get diagnostics v_rows = row_count;

  -- The parent may already be gone during a cascading delete (the foreign key then nulls the
  -- reference); only an existing parent is checked.
  if v_rows = 0 then
    return new;
  end if;

  v_owner := nullif(to_jsonb(new) ->> tg_argv[3], '')::uuid;
  if v_owner is distinct from v_parent_owner then
    raise exception using errcode = '23514', message = 'owner_mismatch';
  end if;

  return new;
end $$;

create trigger course_sections_owner_consistency
  before insert or update on public.course_sections
  for each row execute function public.assert_same_owner(
    'courses', 'owner_id', 'course_id', 'owner_id'
  );

create trigger citations_owner_consistency
  before insert or update on public.citations
  for each row execute function public.assert_same_owner(
    'course_sections', 'owner_id', 'section_id', 'owner_id'
  );

create trigger tutor_messages_owner_consistency
  before insert or update on public.tutor_messages
  for each row execute function public.assert_same_owner(
    'tutor_conversations', 'user_id', 'conversation_id', 'user_id'
  );

create trigger chapter_summaries_owner_consistency
  before insert or update on public.chapter_summaries
  for each row execute function public.assert_same_owner(
    'courses', 'owner_id', 'course_id', 'user_id'
  );

create trigger reading_progress_owner_consistency
  before insert or update on public.reading_progress
  for each row execute function public.assert_same_owner(
    'courses', 'owner_id', 'course_id', 'user_id'
  );

-- ADR-0040 : chaque message touche sa discussion, pour trier les discussions par activité.
create or replace function public.touch_tutor_conversation() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  update public.tutor_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return null;
end $$;

create trigger tutor_messages_touch_conversation after insert on public.tutor_messages
  for each row execute function public.touch_tutor_conversation();

-- Les fonctions de déclencheur ne sont pas appelables directement.
revoke execute on function public.switch_current_course_version() from public, anon, authenticated;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;
revoke execute on function public.touch_tutor_conversation() from public, anon, authenticated;
