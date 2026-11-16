-- RLS de la table des reçus de synchronisation hors ligne (SPEC-801 ET-6, ADR-0200).
-- Chaque reçu appartient à l'utilisateur qui a envoyé l'entrée ; l'isolation est stricte.

alter table public.offline_sync_receipts enable row level security;
alter table public.offline_sync_receipts force row level security;

create policy offline_sync_receipts_owner_all on public.offline_sync_receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
