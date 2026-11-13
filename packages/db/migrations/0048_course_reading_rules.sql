-- Contraintes et RLS de la lecture du cours (SPEC-609 ET-1, ET-2, ET-4, BR-COU-08, BR-COU-09,
-- BR-MEM-09, ADR-0112). Migration personnalisée appliquée après `course_reading` :
--   * RLS et politique propriétaire sur l'historique des signalements ;
--   * cohérence du propriétaire entre un signalement et sa section ;
--   * un signalement ne modifie jamais une tentative ni une brique existante.
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.course_section_reports enable row level security;

create policy course_section_reports_owner_all on public.course_section_reports
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create trigger course_section_reports_owner_consistency
  before insert or update on public.course_section_reports
  for each row execute function public.assert_same_owner(
    'course_sections', 'owner_id', 'section_id', 'owner_id'
  );
