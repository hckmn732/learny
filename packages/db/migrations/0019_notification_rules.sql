-- Contraintes, RLS et déclencheur de SPEC-109 (EF-3, EF-5, ET-4, ET-5 ; ADR-0112, ADR-0214).
-- Migration personnalisée appliquée après la migration générée `notifications` :
--   * RLS activée dès la création sur les deux tables ;
--   * l'apprenant lit et met à jour ses notifications (marquage lu) ; la création reste au rôle
--     service du producteur (SPEC-209) ou des jobs, qui contourne la RLS ;
--   * `notification_deliveries` est en lecture seule pour son propriétaire : le service unifié de
--     notifications (SPEC-209) écrit le journal, jamais l'interface (ADR-0112) ;
--   * les états d'une livraison sont monotones : une ligne `sent` ne redevient jamais autre chose,
--     et son `sent_at` ne change plus (ET-5).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

-- EF-4, ET-4, CL-7 — le propriétaire lit sa boîte, la marque lue et peut la supprimer avec son
-- compte ; aucune politique ne nomme un autre utilisateur, donc une formation partagée ne donne
-- jamais accès à la boîte d'un autre membre.
create policy notifications_owner_all on public.notifications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- EF-5, ET-4, CL-7 — le journal de livraison est lisible par le propriétaire de la notification,
-- jamais par un autre apprenant. Aucune politique d'écriture : le service de notifications
-- (SPEC-209) écrit le journal avec le rôle service (ADR-0112).
create policy notification_deliveries_owner_select on public.notification_deliveries
  for select to authenticated
  using (
    exists (
      select 1
      from public.notifications n
      where n.id = notification_deliveries.notification_id
        and n.user_id = (select auth.uid())
    )
  );

-- EF-3, ET-5, CL-5 — `sent` est final : une livraison envoyée ne redevient ni `scheduled` ni
-- `failed`, et son horodatage d'envoi est immuable. Le déclencheur complète les contraintes de
-- colonne (`sent` exige `sent_at`, `capped`/`skipped_pref` ne le portent pas) pour un écrivain SQL
-- direct comme pour le repository.
create or replace function public.assert_delivery_status_transition() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  if old.status = 'sent' and new.status <> 'sent' then
    raise exception using
      errcode = '23514',
      message = 'notification_delivery_sent_is_final';
  end if;

  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
    raise exception using
      errcode = '23514',
      message = 'notification_delivery_sent_at_immutable';
  end if;

  if old.notification_id <> new.notification_id or old.channel <> new.channel then
    raise exception using
      errcode = '23514',
      message = 'notification_delivery_identity_immutable';
  end if;

  return new;
end $$;

create trigger notification_deliveries_monotone
  before update on public.notification_deliveries
  for each row execute function public.assert_delivery_status_transition();
