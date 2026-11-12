-- Politiques RLS, helpers d'appartenance et durcissement de SPEC-113 (EF-1 à EF-7, ET-1 à ET-6 ;
-- ADR-0022, ADR-0035, ADR-0248).
--
-- Les migrations SPEC-102 à 112 ont activé RLS dès la création des tables mais laissaient plusieurs
-- tables personnelles sans politique et les tables de programme sans lecture partagée. Cette
-- migration additive ne réécrit aucune migration fusionnée : elle complète les politiques, ajoute
-- deux helpers `security definer` bornés à un booléen, et force RLS sur chaque table applicative.
-- Le rôle `postgres` (serviceDb, superutilisateur avec `bypassrls`) reste utilisé par les jobs et
-- les fixtures ; aucun test d'isolation ne s'appuie sur lui pour prouver une autorisation.

-- ---------------------------------------------------------------------------------------------
-- ET-2, ET-3 — helpers d'appartenance. Ils ne renvoient qu'un booléen pour `auth.uid()`, ne
-- permettent jamais de lire la table des membres d'un autre groupe et fixent `search_path`.
-- `security definer` évite la récursion des politiques de `formations` sur elles-mêmes.
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_formation_member(p_formation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.formations f
    where f.id = p_formation_id
      and f.group_id is not null
      and public.is_group_member(f.group_id)
  );
$$;

create or replace function public.is_formation_owner(p_formation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.formations f
    where f.id = p_formation_id
      and f.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_formation_member(uuid) from public;
revoke all on function public.is_formation_owner(uuid) from public;
revoke execute on function public.is_formation_member(uuid) from anon;
revoke execute on function public.is_formation_owner(uuid) from anon;
revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.is_group_owner(uuid) from anon;
revoke execute on function public.count_active_formations(uuid) from anon;
grant execute on function public.is_formation_member(uuid) to authenticated, service_role;
grant execute on function public.is_formation_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- EF-1 — identité et préférences : lecture et mise à jour limitées à la ligne de `auth.uid()`.
-- Le profil et ses réglages sont créés par le déclencheur d'inscription `security definer` ; aucune
-- politique d'insertion ou de suppression n'est accordée au rôle `authenticated`.
-- ---------------------------------------------------------------------------------------------
create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy study_preferences_owner_all on public.study_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notification_settings_owner_all on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_owner_all on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy automation_settings_owner_all on public.automation_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy pauses_owner_all on public.pauses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- EF-2, ET-6 — programme partagé. Un membre d'un groupe actif lit la formation et son programme ;
-- seul le propriétaire les écrit. Les liens personnels (`notion_links.owner_id` non nul) restent
-- privés et ne sont jamais exposés par l'appartenance.
-- ---------------------------------------------------------------------------------------------
drop policy if exists formations_search_owner_select on public.formations;

create policy formations_owner_select on public.formations
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy formations_member_select on public.formations
  for select to authenticated
  using (group_id is not null and public.is_group_member(group_id));

create policy formations_owner_insert on public.formations
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy formations_owner_update on public.formations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy formations_owner_delete on public.formations
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy modules_owner_all on public.modules
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

create policy modules_member_select on public.modules
  for select to authenticated
  using (public.is_formation_member(formation_id));

create policy chapters_owner_all on public.chapters
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

create policy chapters_member_select on public.chapters
  for select to authenticated
  using (public.is_formation_member(formation_id));

drop policy if exists notions_search_owner_select on public.notions;

create policy notions_owner_all on public.notions
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

create policy notions_member_select on public.notions
  for select to authenticated
  using (public.is_formation_member(formation_id));

create policy notion_links_owner_all on public.notion_links
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy notion_links_programme_select on public.notion_links
  for select to authenticated
  using (
    owner_id is null
    and (
      public.is_formation_owner(formation_id)
      or public.is_formation_member(formation_id)
    )
  );

create policy notion_links_programme_owner_insert on public.notion_links
  for insert to authenticated
  with check (owner_id is null and public.is_formation_owner(formation_id));

create policy notion_links_programme_owner_update on public.notion_links
  for update to authenticated
  using (owner_id is null and public.is_formation_owner(formation_id))
  with check (owner_id is null and public.is_formation_owner(formation_id));

create policy notion_links_programme_owner_delete on public.notion_links
  for delete to authenticated
  using (owner_id is null and public.is_formation_owner(formation_id));

-- EF-3 — le cadrage, les imports et les demandes d'ajustement appartiennent au propriétaire de la
-- formation ; ils ne sont jamais partagés avec les membres du groupe.
create policy cadrage_messages_owner_all on public.cadrage_messages
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

create policy programme_imports_owner_all on public.programme_imports
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

create policy programme_change_requests_owner_all on public.programme_change_requests
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

-- EF-3 — progression personnelle par membre : chaque apprenant ne lit et n'écrit que la sienne.
create policy chapter_progress_owner_all on public.chapter_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy module_progress_owner_all on public.module_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- EF-3, BR-APP-03 — ressources et passages restent strictement privés au propriétaire, même dans
-- un groupe. Les passages sont produits par le service de traitement ; l'utilisateur les lit.
-- ---------------------------------------------------------------------------------------------
create policy resources_owner_all on public.resources
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy resource_chunks_owner_select on public.resource_chunks
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- EF-3 — cours, corrections, citations et lecture restent privés au propriétaire.
-- ---------------------------------------------------------------------------------------------
drop policy if exists courses_search_owner_select on public.courses;

create policy courses_owner_all on public.courses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists course_sections_search_owner_select on public.course_sections;

create policy course_sections_owner_all on public.course_sections
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- L'archive des corrections est écrite par le déclencheur `security definer` ; l'apprenant ne la
-- lit que pour ses propres sections.
create policy course_section_revisions_owner_select on public.course_section_revisions
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy citations_owner_all on public.citations
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy reading_progress_owner_all on public.reading_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy chapter_summaries_owner_all on public.chapter_summaries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tutor_conversations_owner_all on public.tutor_conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tutor_messages_owner_all on public.tutor_messages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- ET-1 — FORCE RLS sur toutes les tables applicatives. Le propriétaire des tables est `postgres`
-- (rôle de `serviceDb`) : il conserve `bypassrls` pour les migrations, le seed et les jobs, tandis
-- que tout autre rôle reste soumis aux politiques. Les vues ne sont pas concernées.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relispartition
    order by c.relname
  loop
    execute format('alter table public.%I force row level security', v_table.relname);
  end loop;
end $$;
