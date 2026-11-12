-- Conventions transverses rattrapées après les specs P2 (SPEC-101 CL-6).
-- 1. `rate_limits.updated_at` est maintenu par le déclencheur partagé.
-- 2. `stripe_events.created_at` respecte la convention timestamptz + default now().

drop trigger if exists set_updated_at on public.rate_limits;
create trigger set_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

alter table public.stripe_events
  alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.stripe_events
  alter column created_at set default now();
