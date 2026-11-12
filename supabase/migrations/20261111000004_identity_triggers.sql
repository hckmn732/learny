-- Declencheurs, RLS et cles etrangeres de SPEC-102 (ET-2, ET-4, ADR-0112, ADR-0114, ADR-0236).
-- Migration personnalisee : politiques RLS, declencheurs et reference vers le schema `auth`
-- ne sont pas exprimables dans le snapshot Drizzle. Ne jamais modifier apres fusion.

-- Reference vers auth.users, proprietaire Supabase Auth : elle ne peut pas figurer dans le
-- snapshot Drizzle (schema hors `public`). Suppression en cascade exigee par EF-4.
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- RLS activee des la creation (ADR-0112) : sans politique, seul le proprietaire (serviceDb)
-- accede aux lignes ; SPEC-113 ajoutera les politiques nommees.
alter table public.profiles enable row level security;
alter table public.study_preferences enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.automation_settings enable row level security;
alter table public.pauses enable row level security;

-- updated_at maintenu par la fonction partagee (SPEC-101, EF-5).
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.study_preferences
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.automation_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pauses
  for each row execute function public.set_updated_at();

-- BR-ACC-12 / ADR-0030 : fuseau IANA valide, e-mail non modifiable en V1.
create or replace function public.validate_profile() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  if new.timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception using errcode = '22023', message = 'invalid_timezone';
  end if;

  if tg_op = 'UPDATE'
     and new.email is distinct from old.email
     and current_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'email_immutable';
  end if;

  return new;
end $$;

create trigger validate_profile before insert or update on public.profiles
  for each row execute function public.validate_profile();

-- ADR-0114 : une inscription dans auth.users cree le profil et les reglages par defaut dans la
-- meme transaction. Idempotent (`on conflict do nothing`), valeurs metier de EF-6.
create or replace function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_first_name text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  v_last_name text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  v_language text := new.raw_user_meta_data ->> 'course_language';
  v_timezone text := new.raw_user_meta_data ->> 'timezone';
begin
  if v_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    v_timezone := 'Europe/Paris';
  end if;

  if v_language is null or v_language not in ('fr', 'en', 'es', 'de') then
    v_language := 'fr';
  end if;

  insert into public.profiles (
    id, email, first_name, last_name, course_language, tutor_tone, timezone
  )
  values (
    new.id,
    new.email,
    left(v_first_name, 60),
    left(v_last_name, 60),
    v_language::public.course_language,
    'vous',
    v_timezone
  )
  on conflict (id) do nothing;

  insert into public.study_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notification_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.automation_settings (user_id, key, params)
  select new.id, k, public.default_automation_params(k::text)
  from pg_catalog.unnest(pg_catalog.enum_range(null::public.automation_key)) as k
  on conflict (user_id, key) do nothing;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
