-- Contraintes, RLS et déclencheurs de SPEC-107 (ET-3, ET-4, EF-3, EF-4 ; ADR-0112, ADR-0149).
-- Migration personnalisée appliquée après la migration générée `memory` :
--   * RLS activée dès la création sur les trois tables ;
--   * `notion_states` reste modifiable par son propriétaire, `review_logs` et `gap_events` sont en
--     lecture seule pour l'utilisateur (écritures par le service, ADR-0112 §4) ;
--   * `set_updated_at` sur `notion_states` (ADR-0022) ;
--   * une confusion ne peut désigner qu'une autre notion de la même formation (EF-2) ;
--   * le journal de révision et l'historique des lacunes sont append-only : seule la suppression en
--     cascade du compte ou une politique de rétention explicite peut retirer une ligne (EF-3).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.notion_states enable row level security;
alter table public.review_logs enable row level security;
alter table public.gap_events enable row level security;

-- ET-4 — l'état courant appartient à l'apprenant ; les services autorisés écrivent via serviceDb
-- (le propriétaire contourne la RLS), jamais via une politique `authenticated` supplémentaire.
create policy notion_states_owner_all on public.notion_states
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ADR-0112 §4 — le journal de révision et les événements de lacune sont en lecture seule pour
-- l'utilisateur ; aucune politique d'écriture n'existe, donc une écriture `authenticated` échoue.
create policy review_logs_owner_select on public.review_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy gap_events_owner_select on public.gap_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ADR-0022 — toute table mutable entretient updated_at par le déclencheur partagé.
create trigger set_updated_at
  before update on public.notion_states
  for each row execute function public.set_updated_at();

-- EF-2 — `gap_confused_with` désigne une autre notion de la même formation. La contrainte CHECK
-- couvre déjà l'égalité avec notion_id ; ce déclencheur vérifie l'appartenance à la formation.
create or replace function public.assert_gap_confusion_same_formation() returns trigger
  language plpgsql
  set search_path = ''
  as $$
declare
  notion_formation uuid;
  confused_formation uuid;
begin
  if new.gap_confused_with is null then
    return new;
  end if;

  select n.formation_id into notion_formation
  from public.notions n
  where n.id = new.notion_id;

  select n.formation_id into confused_formation
  from public.notions n
  where n.id = new.gap_confused_with;

  if notion_formation is null
     or confused_formation is null
     or notion_formation <> confused_formation then
    raise exception using
      errcode = '23514',
      message = 'gap_confusion_formation_mismatch';
  end if;

  return new;
end $$;

create trigger notion_states_confusion_same_formation
  before insert or update of gap_confused_with, notion_id on public.notion_states
  for each row execute function public.assert_gap_confusion_same_formation();

-- EF-3 — le journal de révision est append-only : ni un service ni un écrivain SQL direct ne
-- réécrit une mesure passée. La suppression reste possible pour la cascade du compte et la
-- rétention (CL-5), jamais pour une correction de mesure.
create or replace function public.reject_review_log_update() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  -- CL-5 : la seule mise à jour tolérée est celle de la clé étrangère `on delete set null` quand
  -- la réponse d'origine disparaît. Toute autre colonne reste identique, donc aucune mesure n'est
  -- réécrite ; un écrivain SQL direct ne peut pas emprunter ce chemin pour corriger un journal.
  if new.answer_id is null
     and old.answer_id is not null
     and new.user_id = old.user_id
     and new.notion_id = old.notion_id
     and new.source = old.source
     and new.grade = old.grade
     and new.correct is not distinct from old.correct
     and new.time_ms is not distinct from old.time_ms
     and new.reviewed_at = old.reviewed_at
     and new.fsrs_before is not distinct from old.fsrs_before
     and new.fsrs_after is not distinct from old.fsrs_after then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'review_log_immutable';
end $$;

create trigger review_logs_append_only
  before update on public.review_logs
  for each row execute function public.reject_review_log_update();

-- EF-4 — l'historique des lacunes est lui aussi un journal : un événement se crée, ne se réécrit
-- pas. L'état courant est mis à jour dans `notion_states`, pas dans l'événement.
create or replace function public.reject_gap_event_update() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  raise exception using
    errcode = '23514',
    message = 'gap_event_immutable';
end $$;

create trigger gap_events_append_only
  before update on public.gap_events
  for each row execute function public.reject_gap_event_update();
