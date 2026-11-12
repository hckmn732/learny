-- Contraintes, RLS, agrégat local et déclencheurs de SPEC-110 (ET-2, ET-3, ET-4 ; ADR-0112,
-- ADR-0245). Migration personnalisée appliquée après la migration générée `ai_billing` :
--   * RLS activée dès la création sur les quatre tables ;
--   * `ai_credentials` et `ai_task_models` appartiennent à leur seul propriétaire, tandis que
--     `ai_calls` et `subscriptions` sont en lecture seule pour l'utilisateur : leur écriture reste
--     réservée aux services et jobs autorisés (journal IA, webhooks Stripe) ;
--   * une tâche ne peut désigner que la clé du même apprenant (CL-7, EF-2) ;
--   * `ai_spend_today` agrège les appels gérés réellement facturés du jour civil local, avec des
--     bornes UTC calculées depuis `profiles.timezone` (ET-3, CL-5, CL-6) ;
--   * `set_updated_at` sur les deux tables mutables (ADR-0022).
-- Ne jamais modifier après fusion : ajouter une migration.

alter table public.ai_credentials enable row level security;
alter table public.ai_task_models enable row level security;
alter table public.ai_calls enable row level security;
alter table public.subscriptions enable row level security;

-- ET-4 — l'apprenant gère ses clés : lecture, création, mise à jour et suppression passent par la
-- RLS propriétaire. Le chiffré n'est jamais lisible par un autre compte (CL-8).
create policy ai_credentials_owner_all on public.ai_credentials
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ET-4 — le choix de modèle par tâche appartient à l'apprenant.
create policy ai_task_models_owner_all on public.ai_task_models
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ET-4, ADR-0112 §4 — le journal des appels est écrit par le service IA, jamais par le client.
create policy ai_calls_owner_select on public.ai_calls
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ET-4, ADR-0112 §4, ADR-0215 — l'abonnement est tenu à jour par les webhooks Stripe ; le client
-- le lit seulement.
create policy subscriptions_owner_select on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ADR-0022 — toute table mutable entretient updated_at par le déclencheur partagé.
create trigger set_updated_at
  before update on public.ai_credentials
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- EF-2, CL-7 — une tâche ne référence qu'une clé de son propriétaire. La FK `on delete set null`
-- retire la référence quand la clé disparaît ; ce garde empêche de rattacher la clé d'autrui.
create or replace function public.assert_ai_task_model_credential_owner() returns trigger
  language plpgsql
  set search_path = ''
  as $$
declare
  credential_owner uuid;
begin
  if new.credential_id is null then
    return new;
  end if;

  select c.user_id into credential_owner
  from public.ai_credentials c
  where c.id = new.credential_id;

  if credential_owner is null or credential_owner <> new.user_id then
    raise exception using
      errcode = '23514',
      message = 'ai_task_model_credential_owner_mismatch';
  end if;

  return new;
end $$;

create trigger ai_task_models_credential_owner
  before insert or update of credential_id, user_id on public.ai_task_models
  for each row execute function public.assert_ai_task_model_credential_owner();

-- EF-5, ET-3, CL-6 — dépense du jour civil de l'apprenant dans son fuseau IANA. Les bornes sont
-- converties en instants UTC : le début du jour local et le début du jour suivant. Le changement
-- d'heure est donc absorbé (jour de 23 ou 25 heures) et `date(created_at)` au fuseau serveur
-- n'est jamais utilisé. Seuls les appels gérés et réellement facturés comptent : les appels BYOK
-- et les refus/plafonnements à coût nul sont exclus (CL-3, CA-2).
--
-- `profiles` n'a pas encore de politique `authenticated` (SPEC-102) : la fonction est donc
-- `security definer`, avec un garde explicite sur les revendications JWT. Un compte authentifié ne
-- peut lire que sa propre dépense ; le rôle service (aucune revendication) lit toutes les lignes.
-- ADR-0245 consigne cette décision, révisable quand SPEC-113 ouvrira `profiles` aux propriétaires.
create or replace function public.ai_spend_today(
  p_user_id uuid,
  p_now timestamptz default now()
)
  returns numeric
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
declare
  claim_role text;
  claim_sub uuid;
  zone text;
  day_start timestamptz;
  day_end timestamptz;
  total numeric;
begin
  claim_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  claim_sub := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  -- CL-8 — un compte ne consulte jamais la dépense d'un autre compte.
  if claim_role = 'authenticated' and (claim_sub is null or claim_sub <> p_user_id) then
    return 0;
  end if;

  select p.timezone into zone from public.profiles p where p.id = p_user_id;
  if zone is null then
    return 0;
  end if;

  day_start := ((p_now at time zone zone)::date)::timestamp at time zone zone;
  day_end := (((p_now at time zone zone)::date + 1)::timestamp) at time zone zone;

  select coalesce(sum(c.cost_usd), 0)::numeric(12, 6)
  into total
  from public.ai_calls c
  where c.user_id = p_user_id
    and c.managed
    and c.cost_usd > 0
    and c.created_at >= day_start
    and c.created_at < day_end;

  return total;
end $$;

comment on function public.ai_spend_today(uuid, timestamptz) is
  'Dépense IA fournie du jour civil local de l''apprenant (SPEC-110 EF-5).';

-- EF-5 — vue attendue par data-model §9. La vue s'exécute avec les droits de son propriétaire,
-- car `profiles` n'est pas encore lisible par `authenticated` ; son filtre de revendications ne
-- rend que la ligne du compte courant. Un service sans revendication voit toutes les lignes.
create view public.ai_spend_today as
  select p.id as user_id,
         public.ai_spend_today(p.id, now()) as spent_usd
  from public.profiles p
  where coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
          ''
        ) <> 'authenticated'
     or p.id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

comment on view public.ai_spend_today is
  'Dépense IA fournie du jour pour chaque apprenant, dans son fuseau (SPEC-110 EF-5).';

-- ET-3 — la vue et la fonction sont lisibles par le client authentifié et le rôle service ; la
-- RLS reste appliquée à l'intérieur de la vue et de la fonction.
grant select on public.ai_spend_today to authenticated, service_role;
grant execute on function public.ai_spend_today(uuid, timestamptz) to authenticated, service_role;
