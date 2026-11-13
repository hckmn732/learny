-- Règles des jobs de banque de questions (SPEC-513 ET-2, ET-4 ; ADR-0026, ADR-0301).
--
-- La table est un état de traitement, pas un contenu pédagogique : l'apprenant lit ses propres
-- jobs, seul le rôle service (jobs et services explicitement autorisés) les écrit. Les questions
-- restent dans `bricks`/`brick_versions`, protégées par leurs politiques existantes.
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.question_bank_jobs enable row level security;
alter table public.question_bank_jobs force row level security;

create policy question_bank_jobs_owner_select on public.question_bank_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

create trigger set_updated_at
  before update on public.question_bank_jobs
  for each row execute function public.set_updated_at();

comment on table public.question_bank_jobs is
  'État idempotent des banques de questions personnelles (SPEC-513) : clé apprenant, notion, format et version de cours.';

comment on column public.question_bank_jobs.error_code is
  'Code sûr et borné (jamais un message fournisseur ni un contenu d’apport).';

comment on column public.question_bank_jobs.complete is
  'Vrai seulement si le nombre demandé de variantes distinctes est disponible.';
