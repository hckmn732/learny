-- Contraintes, RLS et déclencheurs de SPEC-108 (ET-2, ET-3, EF-2 ; ADR-0112, ADR-0022).
-- Migration personnalisée appliquée après la migration générée `planning` :
--   * RLS activée dès la création sur les quatre tables ;
--   * `schedule_slots` et `daily_activity` sont modifiables par leur propriétaire ;
--   * `automation_actions` est lisible et décidable par son propriétaire, mais créée par le rôle
--     service des automatismes (SPEC-711) ; `milestones` est en lecture seule pour l'utilisateur ;
--   * `set_updated_at` sur `schedule_slots` (ADR-0022) ;
--   * la cohérence d'un déplacement est vérifiée en base : l'origine existe, appartient au même
--     propriétaire et à la même formation, et a bien été passée en `moved` (EF-2, CL-2, CL-3).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.schedule_slots enable row level security;
alter table public.automation_actions enable row level security;
alter table public.daily_activity enable row level security;
alter table public.milestones enable row level security;

-- ET-3, EF-6 — le propriétaire lit et écrit ses créneaux ; aucune politique ne nomme une autre
-- personne, donc une formation partagée ne donne jamais accès aux créneaux d'un autre membre.
create policy schedule_slots_owner_all on public.schedule_slots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- EF-3, BR-AUT-11 — le journal est lisible par son propriétaire ; il peut accepter, refuser ou
-- annuler une action, mais la création reste au rôle service des automatismes (SPEC-711).
create policy automation_actions_owner_select on public.automation_actions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy automation_actions_owner_update on public.automation_actions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- EF-4, EF-6 — l'activité quotidienne est la propriété de l'apprenant ; l'`upsert` du service ou
-- de l'interface reste borné à sa ligne par la politique.
create policy daily_activity_owner_all on public.daily_activity
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- EF-5 — les jalons sont calculés par les services (SPEC-409) et seulement lus par l'apprenant.
create policy milestones_owner_select on public.milestones
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ADR-0022 — toute table mutable entretient updated_at par le déclencheur partagé.
create trigger set_updated_at
  before update on public.schedule_slots
  for each row execute function public.set_updated_at();

-- EF-2, CL-2, CL-3 — un créneau déplacé n'est jamais réécrit : le nouveau créneau référence
-- l'ancien. Ce déclencheur refuse une origine absente, un changement de propriétaire ou de
-- formation, et un successeur inséré sans que l'origine soit déjà passée en `moved` dans la même
-- transaction. Combiné à l'index partiel `schedule_slots_moved_from_active_unique`, il garantit
-- qu'une opération de déplacement ne crée qu'un seul successeur actif.
create or replace function public.assert_slot_move_consistency() returns trigger
  language plpgsql
  set search_path = ''
  as $$
declare
  origin public.schedule_slots%rowtype;
begin
  if new.moved_from_id is null then
    return new;
  end if;

  select * into origin
  from public.schedule_slots
  where id = new.moved_from_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'schedule_slot_move_origin_missing';
  end if;

  if origin.user_id <> new.user_id or origin.formation_id <> new.formation_id then
    raise exception using
      errcode = '23514',
      message = 'schedule_slot_move_scope_mismatch';
  end if;

  if origin.status <> 'moved' then
    raise exception using
      errcode = '23514',
      message = 'schedule_slot_move_origin_not_moved';
  end if;

  return new;
end $$;

create trigger schedule_slots_move_consistency
  before insert or update of moved_from_id, user_id, formation_id on public.schedule_slots
  for each row execute function public.assert_slot_move_consistency();
