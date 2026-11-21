-- SPEC-2102, ADR-2014 — rules of the Python worker tables.
--
-- `job_deliveries` is a service table: Row Level Security is forced with no policy, so only the
-- owner role (the worker) reads or writes it. `dispatched_at` is backfilled from `sent_at` so the
-- worker never replays the history of the TypeScript dispatcher (expand-only migration).
-- The consumer constraint is rewritten here because the generator escapes `\.` as `.`.

alter table public.job_deliveries drop constraint job_deliveries_consumer_check;
alter table public.job_deliveries
  add constraint job_deliveries_consumer_check check (consumer ~ '^[a-z]+(\.[a-z0-9_]+)+$');

update public.event_outbox set dispatched_at = coalesce(sent_at, created_at);

alter table public.job_deliveries enable row level security;
alter table public.job_deliveries force row level security;
