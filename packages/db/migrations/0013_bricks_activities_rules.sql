-- Contraintes, RLS et déclencheurs de SPEC-106 (ET-3, ET-5, ET-6, ADR-0112, ADR-0021).
-- Migration personnalisée appliquée après la migration générée `bricks_activities` : activation de
-- RLS avec des politiques propriétaire minimales (SPEC-113 livrera la matrice complète), garde
-- transactionnel d'assemblage d'une activité, immuabilité des versions de brique et cohérence
-- propriétaire des signalements et des tentatives. Ne jamais modifier après fusion : ajouter une
-- migration.

-- RLS activée dès la création (ADR-0112) et politiques minimales du propriétaire : aucune lecture
-- publique n'existe entre SPEC-106 et SPEC-113 (ET-6).
alter table public.bricks enable row level security;
alter table public.brick_versions enable row level security;
alter table public.brick_reports enable row level security;
alter table public.activities enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

create policy bricks_owner_all on public.bricks
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy brick_versions_owner_all on public.brick_versions
  for all to authenticated
  using (
    exists (
      select 1 from public.bricks b
      where b.id = brick_versions.brick_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.bricks b
      where b.id = brick_versions.brick_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy brick_reports_owner_all on public.brick_reports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy activities_owner_all on public.activities
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy attempts_owner_all on public.attempts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy answers_owner_all on public.answers
  for all to authenticated
  using (
    exists (
      select 1 from public.attempts a
      where a.id = answers.attempt_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.attempts a
      where a.id = answers.attempt_id
        and a.user_id = (select auth.uid())
    )
  );

-- EF-2 / CL-1 : une version de brique n'est jamais réécrite. La fonction refuse toute mise à jour,
-- y compris une correction de payload ou de numéro ; une nouvelle version crée une nouvelle ligne.
create or replace function public.reject_brick_version_update() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  raise exception using errcode = '23514', message = 'brick_version_immutable';
end $$;

create trigger brick_versions_immutable
  before update on public.brick_versions
  for each row execute function public.reject_brick_version_update();

-- EF-5 / BR-BRI-06 : un signalement porte sur la version exacte de sa brique. La clé étrangère
-- composite `brick_reports_version_brick_fk` garantit l'appartenance ; ce déclencheur garantit que
-- seul le propriétaire de la brique peut la signaler.
create trigger brick_reports_owner_consistency
  before insert or update on public.brick_reports
  for each row execute function public.assert_same_owner(
    'bricks', 'owner_id', 'brick_id', 'user_id'
  );

-- EF-4 / CL-8 : une tentative appartient à l'apprenant propriétaire de son activité.
create trigger attempts_owner_consistency
  before insert or update on public.attempts
  for each row execute function public.assert_same_owner(
    'activities', 'owner_id', 'activity_id', 'user_id'
  );

-- EF-3 / ET-5 / CA-2 : garde transactionnel d'assemblage. Pour chaque `brickVersionId`, la version
-- existe, appartient à la brique désignée, la brique appartient au propriétaire de l'activité, à la
-- même formation, et n'est ni signalée ni retirée. L'échec intervient avant tout commit.
create or replace function public.assert_activity_items_owned(
  p_owner_id uuid,
  p_formation_id uuid,
  p_items jsonb
) returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_item jsonb;
  v_brick_id uuid;
  v_version_id uuid;
  v_owner_id uuid;
  v_formation_id uuid;
  v_status public.brick_status;
  v_version_brick_id uuid;
begin
  -- Un appelant authentifié ne peut vérifier que ses propres activités.
  if (select auth.uid()) is not null and p_owner_id <> (select auth.uid()) then
    raise exception using errcode = '23514', message = 'activity_item_owner_mismatch';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '23514', message = 'activity_items_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_brick_id := nullif(v_item ->> 'brickId', '')::uuid;
      v_version_id := nullif(v_item ->> 'brickVersionId', '')::uuid;
    exception when others then
      raise exception using errcode = '23514', message = 'activity_items_invalid';
    end;

    if v_brick_id is null or v_version_id is null then
      raise exception using errcode = '23514', message = 'activity_items_invalid';
    end if;

    select v.brick_id into v_version_brick_id
    from public.brick_versions v
    where v.id = v_version_id;

    if not found then
      raise exception using errcode = '23514', message = 'activity_item_version_missing';
    end if;

    if v_version_brick_id <> v_brick_id then
      raise exception using errcode = '23514', message = 'activity_item_version_mismatch';
    end if;

    select b.owner_id, b.formation_id, b.status
    into v_owner_id, v_formation_id, v_status
    from public.bricks b
    where b.id = v_brick_id;

    if not found then
      raise exception using errcode = '23514', message = 'activity_item_brick_missing';
    end if;

    if v_owner_id <> p_owner_id then
      raise exception using errcode = '23514', message = 'activity_item_owner_mismatch';
    end if;

    if v_formation_id <> p_formation_id then
      raise exception using errcode = '23514', message = 'activity_item_formation_mismatch';
    end if;

    if v_status <> 'active' then
      raise exception using errcode = '23514', message = 'activity_item_status';
    end if;
  end loop;
end $$;

-- EF-3 : une activité ne devient `ready` que si sa liste est non vide et valide (CL-3).
create or replace function public.assert_ready_activity_items() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
begin
  if new.status = 'ready' then
    if jsonb_array_length(new.items) = 0 then
      raise exception using errcode = '23514', message = 'activity_items_empty';
    end if;
    perform public.assert_activity_items_owned(new.owner_id, new.formation_id, new.items);
  end if;
  return new;
end $$;

create trigger activities_ready_items
  before insert or update of status, items, owner_id, formation_id on public.activities
  for each row execute function public.assert_ready_activity_items();

-- Le garde est appelable par le service de composition (ET-5) mais pas par `anon`. Les fonctions de
-- déclencheur restent internes.
grant execute on function public.assert_activity_items_owned(uuid, uuid, jsonb) to authenticated;
revoke execute on function public.assert_activity_items_owned(uuid, uuid, jsonb) from anon, public;
revoke execute on function public.reject_brick_version_update() from public, anon, authenticated;
revoke execute on function public.assert_ready_activity_items() from public, anon, authenticated;
