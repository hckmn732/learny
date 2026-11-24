# P21 plan — database, identity, RLS, storage, worker (SPEC-2101, SPEC-2102)

Exit state (CP-21): the Python side can run any use case under the same identities and RLS as TypeScript, every HTTP guard of the pipeline is implemented, and a durable worker runs consumers from the outbox. Only the 4 `dev-jobs` demo routes and the demo consumer are owned by Python.

---

## SPEC-2101 — PostgreSQL, identity, RLS, storage, HTTP guards

### Step 1 — Engine and unit of work (`learny/shared/db/`)

Validated in spikes.md §B (SQLAlchemy 2.1 async + psycopg 3.3, prepared statements disabled, claims reset when the pooled connection is returned).

```python
# engine.py
def create_engine(settings: Settings) -> AsyncEngine:
    url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_async_engine(
        url, pool_size=settings.database_pool_max, max_overflow=0, pool_timeout=5, pool_recycle=1800,
        connect_args={"prepare_threshold": None, "connect_timeout": 10},  # Supabase transaction pooler safe
    )

# uow.py
SET_CLAIMS = text("select set_config('request.jwt.claims', :claims, true), "
                  "set_config('request.jwt.claim.sub', :sub, true)")

class Tx:
    """A transaction bound to one connection. Collects outbox events for after-commit hooks."""
    conn: AsyncConnection
    actor: Actor | None
    events: list[str]                      # event ids written in this transaction
    async def emit(self, name: str, data: Mapping[str, object], *, event_id: str | None = None,
                   user_id: str | None = None) -> str: ...   # select public.enqueue_event(...)
    async def set_local(self, setting: str, value: str) -> None: ...  # e.g. learny.actor, hnsw.ef_search

class Database:
    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[Tx]:
        # reject non-UUID ids before connecting (TS userDb does)
        async with self._engine.begin() as conn:
            await conn.execute(SET_CLAIMS, {"claims": claims_json(actor), "sub": actor.user_id})
            await conn.execute(text("set local role authenticated"))
            tx = Tx(conn, actor)
            yield tx
        await self._after_commit(tx.events)     # never runs if the block raised
    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]: ...   # owner role, bypasses RLS
```

- `claims_json` reproduces `packages/db/src/client.ts` exactly: `{"sub","role":"authenticated","aud":"authenticated","email"}` (key order as TS).
- Event id default: `f"{name}:{sha256(canonical(data)).hexdigest()[:32]}"` (00-conventions §7) — add a cross-runtime vector test.
- `service_tx` callers are restricted: `learny/shared/db/privileged.py` holds `PRIVILEGED_CALLERS = {"learny_api.guards.rate_limit": "token buckets", ...}`; a unit test scans the code for `service_tx(` and fails on any module not listed. Start the list from the TS `serviceDb()` call sites (jobs, webhooks, idempotency, rate limiting, storage signing, admin auth calls).
- Advisory locks: `await tx.conn.execute(text("select pg_advisory_xact_lock(:k)"), {"k": key})` with the **same key derivation as TS** (copy the hashing from each call site).

### Step 2 — Identity (`learny/identity/`)

- `domain/actor.py`: `Actor(user_id, email, email_confirmed, claims, transport: Literal["bearer","cookie"])`.
- `infrastructure/jwt.py`: async JWKS cache (httpx, 10 min TTL, refetch on unknown `kid`), PyJWT decode with `options={"verify_exp": False, "require": ["sub","aud","exp","iss"]}`, audience `authenticated`, issuer `<SUPABASE_URL>/auth/v1`, then **check `exp` (and `nbf`/`iat` if jose does) against `deps.clock.now()`** — PyJWT would use the system clock. Algorithms: RS256/ES256/EdDSA with `kid` via JWKS, HS256 with `SUPABASE_JWT_SECRET`. JWKS unavailable → fallback `GET /auth/v1/user` (port of ADR-1009 behaviour).
- `infrastructure/supabase_cookies.py`: parse the `@supabase/ssr` session cookie (`sb-<ref>-auth-token`, chunks `.0…N`, `base64-` prefix) → access token; vectors from SPEC-2001 `supabase-cookies`. Cookie transport validates with `GET /auth/v1/user` (network call, like TS `getUser()`); refreshed cookies are discarded (TS behaviour).
- `infrastructure/gotrue.py`: thin httpx client for the GoTrue endpoints the TS auth routes use (password grant, OTP/magic link, signup, logout, user, admin). No Supabase Python SDK.
- `application/authenticate.py`: `authenticate(deps, headers) -> Actor | None` (Bearer first, then cookies; invalid Bearer → `AppError("UNAUTHENTICATED")`), `assert_fresh(deps, actor)`, `assert_legal_acceptance(deps, actor)` (port of the TS legal check, 422 `LEGAL_ACCEPTANCE_REQUIRED`).

### Step 3 — HTTP guards (`apps/api/src/learny_api/guards/`)

Fill the pipeline stubs from SPEC-2003, porting the TS files line by line:
- `origin.py` ← `packages/services/src/security/origin-guard.ts` + `packages/http/src/security.ts` (exempt paths, Bearer-without-Origin exemption, `Sec-Fetch-Site`, proxy secret with `_PREVIOUS`, `hmac.compare_digest`).
- `rate_limit.py` ← `packages/services/src/security/rate-limit.ts`: same single upsert SQL (copy it), buckets `user:<uuid>:<profile>` / `ip:<hmac32>:<profile>`, profiles default 120/2 per s, ai 20/⅓ per s, auth 10/⅙ per s, headers `ratelimit-limit`, `ratelimit-remaining`, 429 with `Retry-After = max(1, ceil((1 - tokens) * seconds_per_token))`, DB failure → 503, `RATE_LIMIT_MODE=off` refused in production.
- `idempotency.py` ← `packages/http/src/idempotency.ts` + `packages/db/src/repositories/idempotency.ts`: request hash `sha256("METHOD\npath-template\ncanonical(params)\ncanonical(body)")` on the **validated** values, reserve with `insert … on conflict do nothing`, replay with `idempotent-replayed: true`, store success and 4xx, delete on 5xx/exception, 24 h expiry on reuse.

### Step 4 — Storage (`learny/platform/storage.py`)

`StorageGateway` protocol + `SupabaseStorage` (httpx): signed read URLs (600 s, `POST /storage/v1/object/sign/<bucket>/<path>`), upload tokens minted locally with HS256 `SUPABASE_JWT_SECRET` (copy the claims of `SupabaseStorageGateway.signUpload`), service-role upload/download/delete for exports. Path helpers `resource_path`, `export_path`, `parse_owned_path` ported with tests. Ownership proven by a DB row before signing (as TS).

### Step 5 — RLS matrix under Python

- Export `packages/db/src/rls/matrix.ts` to `api/oracles/vectors/rls-matrix.json` (small TS script).
- `tests/integration/shared/test_rls_matrix.py` drives it: for every table and actor (anonymous, owner, other user, group member, non-member, service), perform the expected operations through `Database.user_tx` / `service_tx` and assert allowed/denied exactly as the TS matrix test. Also assert `pg_policies` matches the matrix (same query as TS).
- Tests for: forged `userId` in body ignored, invalid/expired/wrong-issuer/wrong-audience tokens, JWKS outage fallback, claims cleared after the transaction (spike assertion), rollback leaves no outbox row.

### Pitfalls
- Never build `set_config` values by string concatenation: bound parameters only.
- `set local role` must be the second statement of the transaction, before any business query.
- psycopg returns `Decimal` for numeric: convert with the same precision TS gets (postgres.js returns strings for numeric!) — check each numeric column's TS handling before serialising.
- `timestamptz` comes back as aware `datetime`: serialise with `jsonx` (milliseconds, `Z`) — postgres.js returns `Date` objects serialised by `toISOString()`.

---

## SPEC-2102 — Outbox fan-out and the Python worker (ADR-2006, ADR-2014)

Validated in spikes.md §C: 600 deliveries, 4 concurrent workers, one simulated crash, exactly-once side effects, advisory-lock singleton.

### Step 1 — Schema (additive, expand-only)

New custom migration (`pnpm db:migration:custom jobs` → `packages/db/migrations/NNNN_jobs_rules.sql`, synced to `supabase/migrations` by the existing script; update the Drizzle schema in `packages/db/src/schema/events.ts` so `db:check` passes; classify the table `service` in the RLS matrix):

```sql
alter table public.event_outbox add column dispatched_at timestamptz;
update public.event_outbox set dispatched_at = coalesce(sent_at, created_at);   -- history is not replayed
create index event_outbox_undispatched on public.event_outbox (created_at) where dispatched_at is null;

create table public.job_deliveries (
  event_id text not null references public.event_outbox (event_id) on delete cascade,
  consumer text not null check (consumer ~ '^[a-z]+(\.[a-z0-9_]+)+$'),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts smallint not null default 0,
  run_after timestamptz not null,
  locked_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, consumer)
);
create index job_deliveries_ready on public.job_deliveries (run_after) where status in ('pending', 'running');
alter table public.job_deliveries enable row level security;
alter table public.job_deliveries force row level security;   -- no policy: service role only
```

TypeScript ignores both; the TS dispatcher keeps using `sent_at`. `nightly-outbox-cleanup` cascades to deliveries.

### Step 2 — Consumer registry (`apps/worker/src/learny_worker/consumers.py`)

```python
@dataclass(frozen=True)
class Consumer:
    name: str                                   # "assessments.grade_quiz" — context.verb_object
    on: str                                     # event name, e.g. "quiz/submitted"
    run: Callable[[Deps, Event], Awaitable[None]]
    timeout_s: int = 300                        # Inngest `timeouts.finish` or a sane default
    max_attempts: int = 4                       # Inngest retries + 1 (default retries 3)
    run_at: Callable[[Event, Clock], datetime | None] | None = None   # replaces step.sleepUntil

CONSUMERS: tuple[Consumer, ...] = (
    Consumer("devtools.demo_job", on="sdd/demo-requested", run=demo_job),
)
```

`Event` = `(event_id, name, data: <generated event model>, user_id, created_at)`. A consumer runs only if `ownership.yaml` says `py` for its name.

### Step 3 — Dispatcher (`dispatcher.py`), one service transaction per batch

```sql
with batch as (
  select id from public.event_outbox where dispatched_at is null
  order by created_at limit :n for update skip locked)
update public.event_outbox o set dispatched_at = now()
from batch where o.id = batch.id
returning o.event_id, o.name, o.data, o.user_id, o.created_at
```

For each returned event: validate `data` with the generated event model (invalid → insert deliveries with `status='failed'`, `last_error='invalid payload'`, mirroring `NonRetriableError`); for each py-owned consumer subscribed to `name`, `insert into job_deliveries (event_id, consumer, run_after) values (…, coalesce(run_at(event, clock), clock.now())) on conflict do nothing`. Poll every 500 ms (`PY_DISPATCH_INTERVAL_MS`), batch 100.

### Step 4 — Runner (`runner.py`)

Claim with leases (the exact statement from spikes.md §C, with `run_after <= :now` where `:now` = `deps.clock.now()`, and leases on the DB clock):

```sql
update public.job_deliveries d
set status = 'running', attempts = d.attempts + 1, locked_until = now() + make_interval(secs => :lease_s)
where (d.event_id, d.consumer) in (
  select event_id, consumer from public.job_deliveries
  where (status = 'pending' and run_after <= :now) or (status = 'running' and locked_until < now())
  order by run_after limit :free_slots for update skip locked)
returning d.event_id, d.consumer, d.attempts
```

- Lease = consumer `timeout_s` + 30 s. Execute with `asyncio.wait_for(consumer.run(deps, event), consumer.timeout_s)`.
- Success → `status='done', completed_at=now(), locked_until=null`.
- Failure → if `PermanentJobError` or `attempts >= max_attempts`: `status='failed'`, `last_error`, `logger.error` + Sentry (port of the TS "final failure report"); else `status='pending'`, `run_after = :now + backoff(attempts)` with `backoff(n) = min(10 s · 2^(n-1), 1 h)`.
- Concurrency: `PY_WORKER_CONCURRENCY` (default 8) tasks per process; claim only `free_slots`.
- SIGTERM: stop claiming, wait up to 30 s, exit; abandoned leases expire and are re-claimed (spike-proven).
- Consumers must be idempotent: a delivery can run more than once after a crash. Business idempotency = the same mechanisms TS relies on (unique keys, state-transition guards, `on conflict do nothing`).

### Step 5 — Scheduler (`scheduler.py`)

- Leader: a dedicated connection holding `pg_try_advisory_lock(<constant key>)`; others idle and retry every 15 s.
- Two schedules only, hard-coded (no cron library): `hourly` at minute 5 UTC, `nightly` at 01:30 UTC. When a tick is due according to `deps.clock`, call `enqueue_event('cron/hourly-tick:<tick ISO>', 'cron/hourly-tick', <payload>)` with **exactly the payload the TS cron functions emit** (read `packages/jobs/src/functions/cron-hourly-tick.ts` and `cron-nightly.ts`; nightly carries `runDate`) — the event id makes duplicate ticks harmless.
- Owned by `ts` until SPEC-2207: the scheduler checks `ownership.yaml` `crons` and stays idle.

### Step 6 — Inline mode for tests (`inline.py`)

`JOBS_MODE=inline` (forbidden in production) mirrors `packages/jobs/src/inline.ts`: after commit, the API process runs the py-owned consumers of the emitted events synchronously (delays ignored, depth cap 5, per-request `seen` set), with the same error propagation as TS inline (read `inline.ts` and mirror). **Bridge until SPEC-2207**: if a ts-owned consumer subscribes to an emitted event, call Hono to dispatch it — reuse `POST /api/v1/dev/sdd/events/outbox` if it dispatches pending rows, otherwise add a dev-only Hono route `POST /api/v1/dev/jobs/dispatch {eventIds}` calling `dispatchPending` for those ids (guarded like the other dev routes, removed in SPEC-2207). The bridge exists only in non-production modes; in production, Python HTTP owners only appear after SPEC-2207 has moved every consumer (P23).

### Step 7 — First end-to-end slice: `dev-jobs` (4 routes) + demo consumer

Port `packages/contracts/src/dev-jobs.ts` routes and `sdd-demo-pipeline`/`sdd-demo-job`, flip them to `py` in `ownership.yaml`, run `pnpm parity:check --group dev-jobs` and the existing e2e tests that use them. This proves pipeline + UoW + outbox + dispatcher + runner + inline on a real flow before any business context.

### Tests to write
Crash/lease expiry, 4 concurrent runners with no double effect, duplicate event delivery, scheduler singleton with 2 instances, invalid payload → failed, backoff schedule, SIGTERM drain, inline depth cap, ownership filtering (ts-owned consumer never run by Python).

### Observability
Every 60 s the leader logs `worker.stats` (oldest pending age, running, failed in the last hour) from one cheap query; failures go to Sentry. No metrics server.
