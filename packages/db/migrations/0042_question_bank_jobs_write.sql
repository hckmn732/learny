-- Les jobs de banque sont écrits par le service du propriétaire dans sa transaction RLS (SPEC-513
-- ET-4). La politique initiale ne permettait que la lecture ; cette migration additive autorise le
-- propriétaire à créer et mettre à jour ses propres jobs, sans accès croisé.
-- Ne jamais modifier après fusion : ajouter une migration.
drop policy if exists question_bank_jobs_owner_select on public.question_bank_jobs;
create policy question_bank_jobs_owner_all on public.question_bank_jobs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
