# P23 plan — production cutover and TypeScript removal (SPEC-2301, SPEC-2302)

Exit state (CP-23): production is served by the Python API and worker on Coolify, rollback and restore have been rehearsed on the staging environment provided by the project owner (ADR-2009), and the TypeScript backend, Inngest and the facade relay are gone.

**Reached on 2026-11-23** for the code and the documentation: `apps/api`, `apps/worker`, Inngest, the
eleven server packages, the relay, `api/ownership.yaml`, `OWNERSHIP_OVERRIDES` and
`PY_HONO_UPSTREAM_URL` are removed (SPEC-2302, ADR-2043); the final inventory proves that every
operation, special route, consumer and cron is served by Python (§4 below). **Not yet reached**: the
load, canary and timed restore drills that require the staging environment of ADR-2009, and the full
e2e/visual/cross-browser/axe campaign. They are listed as open in `evidence/SPEC-2302/acceptance.md`
and SPEC-2302 stays `in_progress` until they are measured.

Rule for the whole phase: **every production change is a reversible step with a written stop criterion.** No step starts before the previous one met its promotion criteria.

---

## SPEC-2301 — Coolify deployment, progressive cutover, rollback and restore drills

### Step 1 — Build and ship

- CI builds `docker/api-py.Dockerfile` on every `main` commit and pushes `ghcr.io/<owner>/learny-py:<sha>` (use the existing GitHub token permissions; no new registry).
- `docker/compose.coolify.yml` (and `compose.coolify-qa.yml`) gain two services from that image: `api-py` (`uvicorn …`, port 8000, healthcheck `GET /health`, `PY_API_WORKERS=2`) and `worker-py` (`python -m learny_worker`, healthcheck on `PY_WORKER_HEALTH_PORT`). Migrations stay a release job run by the existing `tools/deploy/migrate.mjs`.
- `docs/operations/coolify.md` documents the services, env vars (same names as TS + `PY_*`), secrets, ports, resource limits.
- Connection budget (write it down in the runbook): Supabase pooler limit ≥ api replicas × `PY_API_WORKERS` × `DATABASE_POOL_MAX` + worker replicas × `DATABASE_POOL_MAX` + Hono (during coexistence). Start with `DATABASE_POOL_MAX=5`.

### Step 2 — Staging availability check
If the staging environment (Coolify + Supabase staging in the EU) is not reachable: implement everything that does not need it, then `node tools/sdd/fail.mjs SPEC-2301 "staging indisponible" --external` for CA-1..CA-4 and stop (ADR-2009). Never present a local measurement as a staging one.

### Step 3 — Cutover sequence (staging first, then production)

| # | Step | How | Promotion criteria (staging: 30 min / production: 24 h) | Rollback |
|---|---|---|---|---|
| 1 | Facade in front, relay only | deploy `api-py` with `OWNERSHIP_OVERRIDES={"*":"ts"}`; web `API_INTERNAL_URL` → facade | 5xx rate ≤ baseline, p95 overhead ≤ 20 ms | web `API_INTERNAL_URL` back to Hono |
| 2 | Jobs to Python | deploy `worker-py`; on Hono set `LEARNY_API_ROLE=api` and stop the Inngest sync; run `tools/cutover/jobs-flip.mjs` which marks `dispatched_at = now()` on rows already `sent_at` (Inngest's) so Python only picks the rest; set consumers/crons to `py` | no delivery `failed`, oldest pending < 2 min, digest/reminder counts equal to the previous day ± 5 % | stop worker, re-enable Inngest functions and sync, then `tools/cutover/jobs-rollback.mjs` resends to Inngest the events whose Python deliveries are not `done` (with their original event ids, so Inngest dedups) |
| 3 | HTTP per context, in P22 order | for each context: GET operations canary `py@10` → `py@50` → `py`, then all its writes at once | 5xx ≤ baseline, p95 < 300 ms excluding AI routes (BR-PLA-07), no new Sentry issue type, no parity alarm | override the context back to `ts` |
| 4 | Hono idle | all entries `py`, Hono still deployed but receiving nothing | 7 days in production without rollback | — |

- Canary: `OWNERSHIP_OVERRIDES` accepts `"py@<percent>"` for GET operations only; the bucket is `sha256(user_id or ip-hash) % 100`, so a given user stays on one runtime. Writes never get percentages (single writer, ADR-2005).
- No shadow reads (not needed: parity is proven by oracles before production; avoids double load).

### Step 4 — Drills on staging (evidence required)
- **Rollback under load**: run k6 (reuse the scripts of the CI `perf` job, pointed at the facade) while flipping one context `py → ts → py`; prove no 5xx burst, no lost mutation (k6 checks + row counts), no outbox row pending > 2 min, no `failed` delivery.
- **Backup/restore**: restore the staging database from its latest backup (Supabase PITR or `pg_dump`/`pg_restore` into a scratch database), time it, compare row counts and checksums of the main tables, run the API smoke tests against the restored copy. Record the commands and durations.
- **Load**: k6 mix (reads, writes, tutor SSE with mock LLM) at the target given by the owner, else at 2× the current production peak; archive raw k6 JSON in `evidence/SPEC-2301/`.

### Step 5 — Runbooks (`docs/operations/python-cutover.md`)
Deploy, flip a context, canary, rollback a context, jobs rollback, drain the worker, restore, incident checklist. Each with exact commands.

---

## SPEC-2302 — Full regression and TypeScript backend removal

### Step 1 — Prove Python alone
- Playwright config: remove the Hono webServer; the facade starts with `PY_HONO_UPSTREAM_URL` unset (relay disabled → any non-`py` entry is a startup error).
- Run everything: unit (TS web + Python), integration, e2e desktop/mobile/journeys, cross-browser, visual, axe, perf job, `pnpm parity:check --group all`.

### Step 2 — Remove, in this order (one commit per item, lint/typecheck/build green after each)
1. Relay code, `ownership.yaml` mechanism, `OWNERSHIP_OVERRIDES`, `PY_HONO_UPSTREAM_URL` (Python now owns everything by construction; keep a test asserting every route has a handler).
2. `apps/api` (Hono), its Dockerfile/Vercel config, deploy steps (`deploy.yml` Vercel API deploy, `tools/deploy/sync-inngest.mjs`), Inngest services in `docker/compose.*.yml`, Inngest env vars.
3. Backend packages no longer imported by `apps/web` or tools: compute the set with the import graph (`pnpm why`, `tsc --listFiles` on the web) — expected: `api-routes`, `services`, `jobs`, `llm`, `tutor`, `ingestion`, `notifications`, `automations`, `learning-engine`, `http`, `domain`, and the runtime part of `db`. Keep what the web needs (`contracts`, `api-client`, `api-sdk`, `bricks`, `ui`, `i18n`, `config`, `testing`, `core` if imported).
4. `packages/db`: keep `migrations/`, the Drizzle schema used to generate migrations, `scripts/` (`db:check`, sync, custom migrations) and the RLS matrix data; delete the runtime client, repositories and their tests (Python twins exist).
5. Move the files Python still reads from TS packages before deleting them: `packages/llm/fixtures/` → `packages-py/learny/src/learny/platform/llm/fixtures/`, `packages/tutor/prompts/` → `packages-py/learny/src/learny/tutor/prompts/` (`git mv`, update loaders).
6. The TS tests of removed packages: delete only rows of `test-port-map.md` whose Python twin is green; the map must have no `todo` left.
7. Keep `tools/parity` and the recordings as a permanent regression suite against Python (CI job).

### Step 3 — Documentation
- `docs/architecture/{overview,api,ai,data-model}.md`, `AGENTS.md`, `docs/engineering/{conventions,testing}.md`: describe the Python backend.
- ADR-1002 and ADR-0017: set their status line to "Remplacée par ADR-2001 / ADR-2006" (status line only).
- `docs/architecture/python-backend/` stays as the backend reference.

### Step 4 — Final inventory (delivered)
`node tools/migration/inventory.mjs --runtime` proves: every operation of `api/openapi.yaml` (156
after the removal of the `/_dev` demonstrations, ADR-2041 — the 217 of the pre-P23 registry are not
the contract any more) and all 11 special routes have a Python handler; all 23 consumers and 2 crons
are Python; no TS backend package remains in the build or deployment. `--check` fails on any drift,
and `api/inventory.json` stays the artefact read by the pytest coverage test, the SDK test and the
parity runner. Coolify runs only `api-py` and `worker-py` (+ `web`), `migrate` included. The Vercel
API project deletion is an owner action, listed in the runbook.
