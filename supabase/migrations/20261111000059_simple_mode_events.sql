-- Noms d'événements du mode simple (SPEC-4001 EF-5, EF-9).
--
-- Le mode simple nomme ses deux événements `simple.analysis.requested` et
-- `simple.generation.requested` (EF-5, EF-9) : la validation de `enqueue_event` accepte désormais un
-- nom composé de segments séparés par `/` ou par `.`. Les noms existants restent valides et aucune
-- autre règle de la fonction ne change.

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
  if p_name is null
     or p_name !~ '^[a-z]+(-[a-z]+)*([./][a-z]+(-[a-z]+)*)+$' then
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
