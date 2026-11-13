-- Réservations de budget de l'IA fournie (SPEC-507 ET-2, ET-3, CL-5 ; ADR-0294).
-- Migration personnalisée appliquée après la migration générée `ai_budget_reservations` :
--   * RLS activée et forcée, aucune politique `authenticated` : le journal et les réservations
--     sont des opérations système, réservées au rôle service (`serviceDb`) ;
--   * aucun contenu d'apport ni secret n'est stocké : seuls l'estimation, le jour local et le lien
--     vers la ligne `ai_calls` qui a consommé la réservation sont conservés ;
--   * une réservation expirée n'est jamais lue par `sumReservedUsd` ; aucune tâche de purge n'est
--     nécessaire pour que le plafond redevienne disponible après un incident.
-- Ne jamais modifier après fusion : ajouter une migration.
alter table public.ai_budget_reservations enable row level security;
alter table public.ai_budget_reservations force row level security;

comment on table public.ai_budget_reservations is
  'Réservations transactionnelles du plafond quotidien de l''IA fournie (SPEC-507).';

comment on column public.ai_budget_reservations.local_day is
  'Jour civil du fuseau de l''apprenant : le plafond se renouvelle à son minuit local.';

comment on column public.ai_budget_reservations.expires_at is
  'Fin de bail (15 minutes) : une réservation expirée ne bloque plus le plafond.';
