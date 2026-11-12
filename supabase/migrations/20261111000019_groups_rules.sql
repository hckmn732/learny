-- Contraintes, RLS, vue et fonctions de SPEC-111 (EF-1 à EF-6, ET-1 à ET-5 ; ADR-0035, ADR-0246).
-- Migration personnalisée appliquée après `0018_groups` :
--   * clé étrangère croisée `formations.group_id -> groups` (le cycle entre les deux modules Drizzle
--     ne peut pas être exprimé dans le snapshot) ;
--   * RLS sur `groups` et `group_members`, helpers `is_group_member`/`is_group_owner` en
--     `security definer` pour éviter la récursion d'une politique sur sa propre table ;
--   * déclencheurs de cohérence du propriétaire (rôle owner, appartenance indélébile) ;
--   * vue `group_member_progress` à projection stricte, filtrée par l'appartenance de l'appelant ;
--   * compteur `count_active_formations` exécuté dans le contexte de l'utilisateur.
-- Ne jamais modifier après fusion : ajouter une migration.

-- ET-1, CL-8 — `formations.group_id` déclaré par SPEC-103 reçoit ici sa clé étrangère. La
-- suppression d'une formation emporte son groupe et ses membres ; le `set null` de la formation
-- déjà supprimée est inoffensif (vérifié par le test de cascade).
alter table public.formations
  add constraint formations_group_id_groups_id_fk
  foreign key (group_id) references public.groups (id) on delete set null;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- ET-4 — l'appelant est-il un membre actif du groupe ? `security definer` évite la récursion de la
-- politique de `group_members` sur elle-même ; la fonction ne renvoie qu'un booléen pour
-- `auth.uid()`.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.left_at is null
  );
end $$;

-- ET-4 — seul le propriétaire modifie le code et les membres ; le propriétaire est aussi membre.
create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = (select auth.uid())
  );
end $$;

-- EF-1 — le propriétaire d'une formation active peut créer le groupe ; les membres lisent les
-- informations de groupe nécessaires. Aucune politique ne nomme un autre apprenant.
create policy groups_member_select on public.groups
  for select to authenticated
  using (public.is_group_member(id) or owner_id = (select auth.uid()));

create policy groups_owner_insert on public.groups
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.formations f
      where f.id = formation_id
        and f.owner_id = (select auth.uid())
        and f.status = 'active'
    )
  );

create policy groups_owner_update on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy groups_owner_delete on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ET-4 — les membres lisent les appartenances de leur groupe ; seul le propriétaire les modifie.
-- L'adhésion par code et la sortie passent par les transactions service de SPEC-724 (ADR-0246).
create policy group_members_member_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_owner_insert on public.group_members
  for insert to authenticated
  with check (public.is_group_owner(group_id));

create policy group_members_owner_update on public.group_members
  for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy group_members_owner_delete on public.group_members
  for delete to authenticated
  using (public.is_group_owner(group_id));

-- EF-2 — le rôle d'une appartenance est déterminé par le propriétaire du groupe : la ligne du
-- propriétaire est `owner`, aucune autre ne peut l'être.
create or replace function public.assert_group_member_role() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_owner uuid;
begin
  select g.owner_id into group_owner
  from public.groups g
  where g.id = new.group_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'group_member_group_missing';
  end if;

  if (new.user_id = group_owner and new.role <> 'owner')
     or (new.user_id <> group_owner and new.role = 'owner') then
    raise exception using
      errcode = '23514',
      message = 'group_member_role_mismatch';
  end if;

  return new;
end $$;

create trigger group_members_role_consistency
  before insert or update of group_id, user_id, role on public.group_members
  for each row execute function public.assert_group_member_role();

-- EF-2, CL-4 — l'appartenance du propriétaire ne peut pas être supprimée tant que le groupe existe.
-- Lors de la suppression du groupe, la ligne parente a déjà disparu et le contrôle est ignoré.
create or replace function public.assert_group_owner_not_removed() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_owner uuid;
begin
  select g.owner_id into group_owner
  from public.groups g
  where g.id = old.group_id;

  if found and old.user_id = group_owner then
    raise exception using
      errcode = '23514',
      message = 'group_owner_cannot_leave';
  end if;

  return old;
end $$;

create trigger group_members_owner_not_removed
  before delete on public.group_members
  for each row execute function public.assert_group_owner_not_removed();

-- EF-2 — à la validation de la transaction, chaque groupe possède bien l'appartenance `owner` de
-- son propriétaire. Le contrôle différé laisse `createGroup` insérer le groupe puis son membre.
create or replace function public.assert_group_owner_membership() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  present boolean;
begin
  if not exists (select 1 from public.groups g where g.id = new.id) then
    return null;
  end if;

  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = new.id
      and gm.user_id = new.owner_id
      and gm.role = 'owner'
      and gm.left_at is null
  ) into present;

  if not present then
    raise exception using
      errcode = '23514',
      message = 'group_owner_membership_missing';
  end if;

  return null;
end $$;

create constraint trigger groups_owner_membership_check
  after insert or update on public.groups
  deferrable initially deferred
  for each row execute function public.assert_group_owner_membership();

-- EF-4, ET-3 — projection stricte des six colonnes admises. La vue s'exécute avec les droits de son
-- propriétaire mais vérifie l'appartenance active de l'appelant avant de retourner une ligne ; elle
-- ne lit jamais `notion_states`, `resources`, `courses`, `attempts`, `schedule_slots` ni une
-- discussion. Le module en cours est le premier module ouvert, sinon le plus haut module validé,
-- sinon 1.
create or replace view public.group_member_progress
with (security_invoker = false)
as
select
  g.id as group_id,
  gm.user_id,
  p.first_name,
  coalesce(
    (
      select m.position
      from public.modules m
      join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = gm.user_id
      where m.formation_id = g.formation_id
        and mp.status = 'open'
      order by m.position
      limit 1
    ),
    (
      select max(m.position)
      from public.modules m
      join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = gm.user_id
      where m.formation_id = g.formation_id
        and mp.status = 'validated'
    ),
    1
  )::smallint as current_module_position,
  (
    select count(*)::integer
    from public.modules m
    join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = gm.user_id
    where m.formation_id = g.formation_id
      and mp.status = 'validated'
  ) as validated_modules,
  p.streak_days
from public.groups g
join public.group_members viewer
  on viewer.group_id = g.id
 and viewer.user_id = (select auth.uid())
 and viewer.left_at is null
join public.group_members gm
  on gm.group_id = g.id
 and gm.left_at is null
join public.profiles p on p.id = gm.user_id;

-- EF-5, ET-5, CL-5, CL-6 — formations actives possédées et appartenances actives, sans double
-- comptage du propriétaire membre de son propre groupe. `security definer` est nécessaire tant que
-- SPEC-113 n'a pas ajouté de politique de lecture sur `formations` ; le contrôle `caller` refuse
-- tout identifiant différent de `auth.uid()` et les deux branches filtrent sur `p_user_id`, donc
-- aucune lecture n'est élargie aux groupes d'autrui.
create or replace function public.count_active_formations(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  total integer;
begin
  if caller is not null and caller <> p_user_id then
    raise exception using
      errcode = '42501',
      message = 'count_active_formations_forbidden';
  end if;

  select count(*)::integer into total
  from (
    select f.id
    from public.formations f
    where f.owner_id = p_user_id
      and f.status = 'active'
    union
    select g.formation_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = p_user_id
      and gm.member_status = 'active'
      and gm.left_at is null
  ) active;

  return coalesce(total, 0);
end $$;

-- EXECUTE n'est accordé qu'aux rôles applicatifs ; la vue n'est lisible que par un utilisateur
-- authentifié, la clause `where` de la vue restant le contrôle d'appartenance.
revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.count_active_formations(uuid) from public;
grant usage on schema public to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated, service_role;
grant execute on function public.is_group_owner(uuid) to authenticated, service_role;
grant execute on function public.count_active_formations(uuid) to authenticated, service_role;
grant select on public.group_member_progress to authenticated, service_role;
