-- RLS et fonction d'envoi de la boîte d'événements de SPEC-203 (ET-2, ET-7 ; ADR-0122).
-- Migration personnalisée appliquée après la migration générée `events` :
--   * RLS activée sur `event_outbox` et `sdd_demo_runs`, aucune politique `authenticated` : seul le
--     rôle service (propriétaire des tables) y accède ;
--   * `enqueue_event` : fonction `security definer` appelée par la transaction métier (rôle
--     `authenticated`) pour écrire dans la boîte d'envoi sans droit direct sur la table.
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.event_outbox enable row level security;
alter table public.sdd_demo_runs enable row level security;
-- ADR-0035 — comme toutes les tables applicatives (migration `rls_policies`), RLS est forcée ; le
-- propriétaire `postgres` (rôle de `serviceDb`) conserve `bypassrls`.
alter table public.event_outbox force row level security;
alter table public.sdd_demo_runs force row level security;

-- ET-2 — la boîte d'envoi et les exécutions de démonstration ne sont jamais exposées au client :
-- sans politique `authenticated`, une lecture renvoie zéro ligne et une écriture échoue (42501).

-- ET-2 — insertion idempotente dans la boîte d'envoi (`on conflict (event_id) do nothing`).
-- Renvoie vrai quand la ligne vient d'être créée, faux quand l'identifiant existait déjà (CL-3).
--
-- La fonction étant appelable par tout utilisateur connecté (y compris via PostgREST), elle borne ce
-- qu'un appelant `authenticated` peut mettre en file : uniquement ses propres événements
-- (`p_user_id` nul ou égal à `auth.uid()` ; `data.userId` absent ou identique), jamais un événement
-- `cron/*`. Pour un appelant `authenticated`, la ligne appartient toujours à l'acteur.
-- Un appelant de service (`auth.uid()` nul : jobs, webhooks) n'est pas borné ; un événement dont
-- `data.userId` désigne un autre utilisateur que l'acteur est donc émis par une transaction de
-- service.
create or replace function public.enqueue_event(
  p_event_id text,
  p_name text,
  p_data jsonb,
  p_user_id uuid default null
) returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid := p_user_id;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 256 then
    raise exception 'enqueue_event : identifiant d''événement invalide' using errcode = '22023';
  end if;
  if p_name is null or p_name !~ '^[a-z]+(-[a-z]+)*/[a-z]+(-[a-z]+)*$' then
    raise exception 'enqueue_event : nom d''événement invalide' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'enqueue_event : données invalides' using errcode = '22023';
  end if;
  if v_actor is not null then
    v_owner := coalesce(p_user_id, v_actor);
    if v_owner <> v_actor
       or p_name like 'cron/%'
       or (p_data ? 'userId' and p_data ->> 'userId' is distinct from v_actor::text) then
      raise exception 'enqueue_event : événement non autorisé pour cet utilisateur'
        using errcode = '42501';
    end if;
  end if;

  insert into public.event_outbox (event_id, name, data, user_id)
  values (p_event_id, p_name, p_data, v_owner)
  on conflict (event_id) do nothing;
  return found;
end;
$$;

revoke all on function public.enqueue_event(text, text, jsonb, uuid) from public, anon;
grant execute on function public.enqueue_event(text, text, jsonb, uuid)
  to authenticated, service_role;
