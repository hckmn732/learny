-- RLS de la table des versions de proposition de programme (SPEC-605 ET-1, ET-4).
-- Chaque version appartient au propriétaire de la formation ; un membre du groupe ne la lit pas
-- et un autre utilisateur reçoit 404. Le fichier importé d'origine reste dans programme_imports,
-- dont la politique propriétaire existe déjà (SPEC-103).

alter table public.programme_proposals enable row level security;

create policy programme_proposals_owner_all on public.programme_proposals
  for all to authenticated
  using (public.is_formation_owner(formation_id))
  with check (public.is_formation_owner(formation_id));
