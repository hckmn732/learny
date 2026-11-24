-- RLS des tables du mode simple (SPEC-4001 ET-3 ; ADR-0112, ADR-0113, ADR-4003).
--
-- `simple_analyses` appartient au propriétaire de la formation : un membre du groupe ne la lit pas
-- et un autre utilisateur reçoit 404. `chapter_sources` suit le même propriétaire, filtré par la
-- formation copiée sur la ligne pour éviter une jointure dans la politique.

alter table public.simple_analyses enable row level security;
alter table public.simple_analyses force row level security;

create policy simple_analyses_owner_all on public.simple_analyses
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

alter table public.chapter_sources enable row level security;
alter table public.chapter_sources force row level security;

create policy chapter_sources_owner_all on public.chapter_sources
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));

-- Un index couvrant la reprise de l'analyse : l'état seul est lu à chaque sondage (EF-6, ET-6).
create index if not exists simple_analyses_status_idx
  on public.simple_analyses (status)
  where status in ('analysing', 'failed');
