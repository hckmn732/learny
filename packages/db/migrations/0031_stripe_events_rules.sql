-- RLS de la table des événements Stripe de SPEC-210 (ET-3 ; ADR-0215).
-- Migration personnalisée appliquée après la migration générée `stripe_events` :
--   * RLS activée et forcée sur `stripe_events`, aucune politique `authenticated` : seul le rôle
--     service (propriétaire de la table, `serviceDb`) lit et écrit. Opérations autorisées du service :
--     INSERT ... ON CONFLICT DO NOTHING (déduplication par `event_id`), UPDATE de `processed_at`,
--     SELECT pour les tests ; jamais de DELETE applicatif ;
--   * `subscriptions.stripe_event_at` hérite des politiques existantes de `subscriptions`
--     (lecture propriétaire seule, écriture du service).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.stripe_events enable row level security;
-- ADR-0035 — comme toutes les tables applicatives, RLS est forcée ; le propriétaire `postgres`
-- (rôle de `serviceDb`) conserve `bypassrls`.
alter table public.stripe_events force row level security;

-- Sans politique `authenticated`, une lecture renvoie zéro ligne et une écriture échoue (42501).
