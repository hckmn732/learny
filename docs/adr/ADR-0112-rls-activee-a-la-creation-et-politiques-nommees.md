# ADR-0112 — RLS activée à la création et politiques nommées

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-101 à SPEC-114

## Contexte

Les tables sont créées par SPEC-102 à SPEC-112, mais les politiques sont posées par SPEC-113. Entre les deux, une table sans RLS serait lisible par le rôle `authenticated` (privilèges par défaut de Supabase).

## Décision

1. Chaque spécification de schéma exécute `alter table public.<t> enable row level security;` dans la migration qui crée la table : sans politique, tout accès `anon`/`authenticated` est refusé ; seul `serviceDb` (propriétaire) y accède.
2. SPEC-113 ajoute les politiques. Nommage : `<table>_<opération>_<portée>` avec opération ∈ `select|insert|update|delete|all` et portée ∈ `own` (propriétaire), `member` (appartenance à la formation), `owner_formation` (propriétaire de la formation), `group` (membres du groupe). Toutes les politiques ciblent `to authenticated` ; aucune politique `anon`.
3. Les prédicats d'appartenance passent par des fonctions `security definer` stables (`public.can_read_formation(uuid)`, `public.is_formation_owner(uuid)`, `public.is_group_member(uuid)`) avec `set search_path = ''`.
4. Tables réservées au service (RLS activée, aucune politique) : `idempotency_keys`, `rate_limits`. Tables en lecture seule pour l'utilisateur (écritures par le service uniquement) : `ai_calls`, `subscriptions`, `notification_deliveries`, `review_logs`, `gap_events`, `milestones`, `legal_acceptances`, `data_exports`, `group_members`, `groups` (lecture), `resource_chunks`.
5. `anon` ne reçoit aucun privilège sur les tables `public` (`revoke all ... from anon`).

## Conséquences

Un test générique (SPEC-113) vérifie que 100 % des tables `public` ont la RLS activée et qu'aucune politique ne s'adresse à `anon` ou `public`.
