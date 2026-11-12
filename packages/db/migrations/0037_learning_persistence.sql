-- Persistance transactionnelle du moteur (SPEC-411 ET-1, ET-4, ET-5 ; ADR-0149, ADR-0288).
--
-- L'index unique partiel rend une réponse déjà journalisée non réapplicable, même si deux appels
-- concurrents franchissaient le verrou consultatif. Les deux journaux `review_logs` et
-- `gap_events` restent en lecture seule pour `authenticated` (ADR-0112 §4) : les fonctions
-- `security definer` ci-dessous sont le seul chemin d'écriture d'une transaction `userDb`, et elles
-- vérifient que l'appelant écrit bien pour son propre compte. Ne jamais modifier après fusion :
-- ajouter une migration.

create unique index review_logs_answer_notion_unique
  on public.review_logs (answer_id, notion_id)
  where answer_id is not null;

create or replace function public.append_review_log(
  p_user_id uuid,
  p_notion_id uuid,
  p_answer_id uuid,
  p_source public.review_source,
  p_grade public.fsrs_grade,
  p_correct boolean,
  p_time_ms integer,
  p_reviewed_at timestamptz,
  p_fsrs_before jsonb,
  p_fsrs_after jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_id uuid;
begin
  -- Un appelant authentifié n'écrit que pour lui-même ; un rôle de service sans JWT garde
  -- l'accès direct (propriétaire de la table) pour les jobs explicitement autorisés.
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user_id then
    raise exception using errcode = '42501', message = 'review_log_forbidden';
  end if;

  if not exists (
    select 1
    from public.notion_states s
    where s.user_id = p_user_id
      and s.notion_id = p_notion_id
  ) then
    raise exception using errcode = '23503', message = 'notion_state_missing';
  end if;

  insert into public.review_logs (
    user_id, notion_id, answer_id, source, grade, correct, time_ms, reviewed_at,
    fsrs_before, fsrs_after
  ) values (
    p_user_id, p_notion_id, p_answer_id, p_source, p_grade, p_correct, p_time_ms, p_reviewed_at,
    p_fsrs_before, p_fsrs_after
  )
  on conflict (answer_id, notion_id) where answer_id is not null do nothing
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.append_gap_event(
  p_user_id uuid,
  p_notion_id uuid,
  p_kind public.gap_event_kind,
  p_nature public.gap_nature,
  p_evidence jsonb,
  p_created_at timestamptz
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user_id then
    raise exception using errcode = '42501', message = 'gap_event_forbidden';
  end if;

  if not exists (
    select 1
    from public.notion_states s
    where s.user_id = p_user_id
      and s.notion_id = p_notion_id
  ) then
    raise exception using errcode = '23503', message = 'notion_state_missing';
  end if;

  insert into public.gap_events (
    user_id, notion_id, kind, nature, evidence, created_at
  ) values (
    p_user_id, p_notion_id, p_kind, p_nature, p_evidence, p_created_at
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.append_review_log(
  uuid, uuid, uuid, public.review_source, public.fsrs_grade, boolean, integer, timestamptz,
  jsonb, jsonb
) from public;
revoke all on function public.append_gap_event(
  uuid, uuid, public.gap_event_kind, public.gap_nature, jsonb, timestamptz
) from public;

grant execute on function public.append_review_log(
  uuid, uuid, uuid, public.review_source, public.fsrs_grade, boolean, integer, timestamptz,
  jsonb, jsonb
) to authenticated;
grant execute on function public.append_gap_event(
  uuid, uuid, public.gap_event_kind, public.gap_nature, jsonb, timestamptz
) to authenticated;
