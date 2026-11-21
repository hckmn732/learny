# P20 plan — inventory, contract, foundation (SPEC-2001, SPEC-2002, SPEC-2003)

Exit state of the phase (CP-20): every request from the web goes through a FastAPI facade that relays 100 % of the traffic to Hono, the whole e2e/visual suite is green through it, the contract lives in `api/openapi.yaml`, and parity tooling plus oracles exist. **No business logic is ported in P20.**

Order: SPEC-2001 first; then SPEC-2002 and SPEC-2003 can run in parallel (they only meet on `api/openapi.yaml`: 2002 writes it, 2003 reads it — if 2003 starts first, it codegens from `apps/api/openapi.json` temporarily and switches once 2002 lands).

---

## SPEC-2001 — Inventory, parity matrix and oracles

Everything lives in TypeScript/Node tooling (`tools/migration/`, `tools/parity/`). It talks to the running Hono API over HTTP, so it remains usable after TypeScript backend removal.

### Step 1 — Inventory extractor (`tools/migration/inventory.mjs`, run with `tsx`)

Produces `api/inventory.json` + `evidence/SPEC-2001/inventory.md`. Sources:
1. `ROUTES` from `packages/contracts/src/routes.ts` (import it, do not regex): id, method, path, auth, rateLimit, idempotent, freshAuth, legalAcceptance, validationStatus, successStatus, errors. Expect **217**.
2. Special routes from `packages/api-routes/src/special/manifest.ts` (health, openapi, auth-callback, sprints, unsubscribe page, relay-stream, `_dev` tools…) — listed separately, they are not in the 217.
3. Implementations: for each route id, the implementation module in `packages/api-routes/src/implementations/` and the services functions it calls (static import graph, depth 2 is enough).
4. Tables read/written: grep the SQL/Drizzle calls in the called services (best effort, then completed by hand for the business-critical ones).
5. Jobs: every Inngest function (`packages/jobs/src/functions/index.ts` + `packages/api-routes/src/deps/quiz-grade-registry.ts`): id, trigger, retries, concurrency, idempotency, timeouts, `sleepUntil` usage, service called.
6. Events: `packages/contracts/src/events.ts` (49), producers (grep `outbox.add`/`emitAfterCommit`/`notify`) and consumers.
7. Tests: existing test files that mention the route id, path or implementation (Vitest `[SPEC-x]`, Playwright `@SPEC-x`).
8. Target context: the default mapping below, then human-checked.

Default contract-module → context mapping (route counts from the registry; total 217):

| Context (spec) | Contract modules |
|---|---|
| identity (2201) — 24 | auth 6, me 7, legal 1, security 3, header 1, sidebar 2, home 1, parametres-onglets-et-profil 2, health 1 |
| formation (2201) — 26 | cadrage 7, programme 5, formation-management 5, formations-a-plusieurs 7, notion-graph 1, search 1 |
| learning (2202) — 15 | agenda 1, agenda-deplacer-et-reajuster-le-planning 4, gaps 1, review 3, warmup 2, serie-regularite-et-jalons-interface 2, final-review 2 |
| assessments (2202) — 26 | attempts 5, quiz-result 4, exercises 5, mock-exams 8, bricks 2, offline 2 |
| content (2203) — 19 | resources 7, uploads 6, course 1, course-reading 5 |
| tutor (2204) — 12 | tutor-chat 5, parametres-modeles-d-ia 2, ai-credentials 5 |
| engagement (2205) — 28 | notifications 5, notifications-generation-des-rappels 1, parametres-notifications 2, push 3, email 6, moteur-d-automatismes 6, automatisme-10-mode-pause-et-retour 4, automatisme-9-bilan-de-la-semaine 1 |
| billing + privacy (2206) — 16 | billing 4, personal-data 8, dev-billing 4 |
| jobs demo (2102) — 4 | dev-jobs 4 (first end-to-end proof of the worker) |
| dev & demo (2207) — 47 | dev 2, dev-migration 2, dev-sdd-migration 43 |

`home`, `header`, `sidebar`, `search` are read aggregations → implemented in `learny.views` (00-conventions §2) but owned by the spec listed above.

### Step 2 — Fix the route count

`tools/migration/report.mjs` `countRegistryRoutes` counts the two `defineRoute(` calls inside the `demo()`/`action()` factory bodies of `dev-sdd-migration.ts`. Replace the regex count by importing `ROUTES` (or subtract factory definitions); update its test; `report.mjs --check` must print 217.

### Step 3 — Parity runner (`tools/parity/`)

- `scenarios/<group>.json`: list of scenarios; a scenario is an ordered list of steps `{as: "<actor alias>", method, path, query?, body?, headers?, expect?: {normalize: ["/id", "/createdAt", ...]}}` plus `setup` (named fixtures: `freshUser`, `userWithFormation`, `userWithValidatedProgramme`, … implemented once in `tools/parity/fixtures.ts` using the existing seed/factories through public API calls or `packages/testing` helpers).
- Actors: each scenario creates its own users (Supabase admin API, like `packages/testing/src/supabase.ts`) → no cross-scenario coupling, no DB reset between scenarios.
- Recording captures: status, headers (allow-list from 00-conventions §11), body, SSE events, and the outbox rows created for the scenario's users (`select name, data from event_outbox where user_id = any($1) and created_at >= $2 order by created_at, event_id`).
- `recordings/<group>.json` is written by `--record` against Hono with `CLOCK_FIXED_AT`, `LLM_MODE=mock`, `JOBS_MODE=inline`.
- `--check` replays against any target and prints a diff table; exit 1 on unexplained divergence. Root scripts `parity:record`, `parity:check`.
- Coverage target for SPEC-2001: **at least one success scenario per operation** (217) and, per operation group, the error paths that exist in tests today (401, 403/non-disclosure 404, validation, idempotency replay/conflict, rate limit on one representative route). Generate the boring part (one GET per read route) from the inventory; hand-write mutation chains.

### Step 4 — Engine and cross-runtime oracles (`tools/parity/export-vectors.ts`)

JSON vectors the Python unit tests will replay, written to `api/oracles/vectors/`:
- `learning-engine`: for every exported function, inputs drawn from `fixtures/sap-reference.ts` + fast-check samples with a fixed seed (≥ 200 cases per function) and the TS outputs.
- `bricks`: validate/grade/fingerprint/public payload/shuffle for each of the 13 brick types.
- `jsonx`: `JSON.stringify` and `canonicalJson` of tricky values (floats, exponents, unicode, astral keys), `toISOString`, `Math.round`, `toFixed`.
- `crypto`: AES-GCM encrypt (fixed IV) / decrypt vectors with AAD, HMAC fingerprints, unsubscribe tokens, rate-limit IP HMAC.
- `embeddings-mock`: deterministic mock vectors for 20 inputs.
- `supabase-cookies`: cookies produced by `@supabase/ssr` for short and chunked sessions, and their parsed access tokens.
- `zod-fr`: for each Zod issue kind used by the contracts, the French message produced by `z.locales.fr()` (source: `node_modules/zod/v4/locales/fr.js`).

### Step 5 — Test port map

`evidence/SPEC-2001/test-port-map.md`: one row per backend test file (`packages/{services,db,jobs,llm,tutor,ingestion,learning-engine,notifications,automations,http,api-routes,core}` and `apps/api`): file, number of tests, target Python test module, target spec, status (`todo`). Frontend/web tests are out of the map (they stay).

### Done when

CA-1..CA-5 of the spec; `pnpm parity:check --target http://127.0.0.1:3101` passes against Hono itself (sanity: recording replays identically twice).

---

## SPEC-2002 — Contract source and generated SDK

### Step 1 — Export once, then own the YAML

`packages/contracts/scripts/export-contract.ts` (one-shot + `--check`):
- Writes `api/openapi.yaml` from the existing generator (`packages/contracts/src/openapi.ts`) **plus**:
  - `x-learny` per operation (fields in 00-conventions §6);
  - named component schemas `<RouteIdPascal>Params|Query|Body|Output` (route id `attempts.submit` → `AttemptsSubmit`), referenced from the operations — this gives readable generated Python names;
  - `title` on the reused nested object schemas when Zod has a `.meta({ id })`/`describe` (best effort).
- Writes `api/errors.json` from `ERROR_CATALOG` (`packages/core/src/errors.ts`): `{CODE: {status, title, type}}`.
- Writes `api/events.schema.json` from `EVENTS` (`packages/contracts/src/events.ts`).
- From then on, CI runs the export in `--check` mode: the Zod registry and the YAML must not drift while TypeScript routes exist (`pnpm lint` gains `contract:check`). `apps/api/openapi.json` keeps being generated (Hono serves it) and must equal the YAML converted to JSON minus `x-learny` — add that assertion.

### Step 2 — Generated TypeScript SDK types

- `openapi-typescript` generates `packages/api-sdk/src/schema.d.ts` from the YAML (types only).
- `packages/api-client` keeps its runtime; add a type-level test (`expectTypeOf`) asserting that its request/response types for every route are assignable to the generated ones. **Do not change web imports in this spec** beyond what the test needs — zero behaviour change.

### Step 3 — Compatibility checker (`tools/contract/compat.mjs`)

Compares two OpenAPI documents operation by operation (method, path, params, request schema, success status, response schema, error statuses, security, `x-learny`) and classifies differences breaking / non-breaking; reads `api/contract-exceptions.yaml` (`- {operation, kind, adr: ADR-2xxx, reason}`); exits 1 on any unlisted breaking difference. Used by SPEC-2003 (Python route table vs YAML) and later specs.

### Pitfalls
- Keep keys sorted like today's generator so diffs stay stable.
- Do not "clean up" schemas: the YAML must describe exactly what Zod accepts today.

---

## SPEC-2003 — Python foundation, SDD tooling, facade

### Step 1 — Workspace

Root `pyproject.toml`:

```toml
[tool.uv.workspace]
members = ["packages-py/learny", "apps/api-py", "apps/worker-py"]

[tool.ruff]
target-version = "py313"
line-length = 110
[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "S", "DTZ", "ASYNC", "RUF", "SIM", "PT", "TID"]
[tool.ruff.lint.flake8-tidy-imports.banned-api]
"datetime.datetime.now".msg = "use deps.clock.now()"
"datetime.datetime.utcnow".msg = "use deps.clock.now()"
"time.time".msg = "use deps.clock"
"random".msg = "use learny.shared.prng"

[tool.mypy]
python_version = "3.13"
strict = true
plugins = ["pydantic.mypy"]
exclude = ["generated/"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
markers = ["spec(id): SDD spec id"]
```

Each member has its own `pyproject.toml` (hatchling, `src/` layout). Dependencies per member: `learny` (sqlalchemy, psycopg, pydantic, pydantic-settings, httpx, structlog, pyjwt, cryptography, anthropic, openai, stripe, pywebpush, aiosmtplib, jinja2, pypdf, readability-lxml, lxml_html_clean, youtube-transcript-api, pgvector, tzdata), `learny-api` (learny, fastapi, uvicorn, sentry-sdk), `learny-worker` (learny, sentry-sdk). Dev group at the root: pytest, pytest-asyncio, pytest-cov, hypothesis, ruff, mypy, import-linter, datamodel-code-generator.

### Step 2 — Root scripts and validate.mjs

- `package.json`: `py:sync` (`uv sync --frozen`), `py:lint` (`uv run ruff format --check . && uv run ruff check . && uv run lint-imports`), `py:typecheck` (`uv run mypy packages-py apps/api-py apps/worker-py`), `py:test:unit`, `py:test:int`, `py:codegen` (`uv run python -m learny_api.codegen --check`). Append `py:lint` + `py:codegen` to `lint`, `py:typecheck` to `typecheck`.
- `tools/sdd/validate.mjs`: after the Vitest unit/integration steps, select tracked `*.py` files under `tests/unit` / `tests/integration` that contain `[SPEC-xxxx]`; run `uv run pytest <files> --junitxml=test-results/sdd/<spec>/py-<kind>.xml`; parse the XML (count `<testcase>`, `<failure>`, `<error>`, `<skipped>`); the `unit`/`integration` validation passes when (Vitest part passes or has no tagged test) **and** (pytest part passes or has no tagged file) **and** at least one tagged test passed overall. Copy the XML into `evidence/<spec>/`. Add unit tests for this logic in `tools/sdd/test/unit/`.
- CI (`ci.yml`): `astral-sh/setup-uv` (pinned SHA), `uv sync --frozen`, Python lint/typecheck/unit in `quality`; Python integration in the `integration` job after `db:reset`.

### Step 3 — Shared foundation modules (`packages-py/learny/src/learny/shared/`)

`config.py` (Settings, 00-conventions §8), `clock.py` (Clock protocol, SystemClock, FixedClock, `from_env`), `jsonx.py` (dumps, canonical, js_number — with vectors from SPEC-2001), `jsmath.py`, `errors.py` (AppError, catalog loader from `api/errors.json`, `to_problem()` port of `packages/core/src/errors.ts` `toProblem`), `locale_fr/` (errors titles generated, validation messages from the zod-fr vectors), `logging.py` (structlog setup + redaction), `ids.py`, `deps.py` (Deps dataclass; fields not yet needed are `None`).

### Step 4 — Codegen (`apps/api-py/src/learny_api/codegen.py`)

Runs datamodel-codegen with the options validated in spikes.md §F, on the named component schemas of `api/openapi.yaml`:

```
--input-file-type openapi --openapi-scopes schemas paths parameters
--output-model-type pydantic_v2.BaseModel --target-python-version 3.13
--use-annotated --field-constraints --use-standard-collections --use-union-operator
--enum-field-as-literal all --collapse-root-models
--type-mappings date-time=string date=string uuid=string email=string uri=string time=string duration=string
```

then writes `generated/routes.py` (a `RouteSpec` frozen dataclass per operation built from `x-learny` + model class references), and `generated/events.py` from `api/events.schema.json`. A unit test compiles every `pattern` with Pydantic's validator (Rust regex engine); a pattern it rejects gets `regex_engine="python-re"` on that model via a post-processing step (document each case). `--check` mode regenerates in memory and diffs.

### Step 5 — The facade app

`create_app(deps)` in `main.py`:
1. Load `api/ownership.yaml` (`operations: {route_id: ts|py}`, `special: {"GET /health": ts, …}`, `consumers: {...}`, `crons: {...}`); refuse to start if an operation of `ROUTES` or a special route of the inventory is missing; apply `OWNERSHIP_OVERRIDES` (JSON) only when `APP_ENV != test`.
2. For each operation owned by `py`: `app.add_api_route(path, pipeline.endpoint(spec, HANDLERS[spec.id]), methods=[spec.method], include_in_schema=False)`.
3. Catch-all route (all methods) → `relay.forward(request)` to `PY_HONO_UPSTREAM_URL`. Implementation = spikes.md §A (streamed body both ways, hop-by-hop headers dropped, multiple `Set-Cookie` preserved via `raw_headers`, upstream closed in `finally` so a client disconnect cancels the upstream stream, `httpx.Timeout(connect=2, read=None, write=30, pool=5)`).
4. Upstream unreachable → 502 problem `API_UNAVAILABLE` (same body as the web relay produces today).

In P20 every entry is `ts`: the pipeline exists and is unit-tested with a fake handler, but serves nothing in production paths.

The pipeline steps (port of `packages/http/src/route-handler.ts`, same order, same codes):
1. request id (`x-request-id` kept if `^[A-Za-z0-9-]{8,64}$`, else uuid4);
2. origin guard (CSRF rules, proxy-secret-gated forwarded headers);
3. IP rate limit for public routes;
4. `Idempotency-Key` format check;
5. authentication (Bearer → cookie), `freshAuth`, `EMAIL_NOT_CONFIRMED`;
6. user rate limit;
7. validation: params → query (repeated key → list) → JSON body (1 MiB cap);
8. idempotency reservation (reserve / replay with `idempotent-replayed: true` / 409 / 422);
9. legal acceptance (422);
10. handler call;
11. output validation (500 + `contract_violation` log on failure);
12. response building (headers per 00-conventions §6) + one access log line.

Steps 3–9 call into `learny.identity.public` / `learny.shared` functions that SPEC-2101 implements; in SPEC-2003 they are stubs raising `NotImplementedError`, covered by the fact that no route is `py` yet.

### Step 6 — Playwright through the facade

`apps/web/playwright.config.ts`: API webServer becomes two entries — Hono on `PORT+2` (`PORT=$((PORT+2)) pnpm --filter @learny/api dev`), facade on `PORT+1` (`uv run uvicorn learny_api.main:app --port PORT+1`, env `PY_HONO_UPSTREAM_URL=http://127.0.0.1:PORT+2` + all the shared env). The web keeps `API_INTERNAL_URL=http://127.0.0.1:PORT+1`. Health URL unchanged. **No test file is modified.** Run the full suite (`pnpm test:e2e`, desktop+mobile+journeys) and the visual suite.

### Step 7 — Docker

`docker/api-py.Dockerfile`: `ghcr.io/astral-sh/uv:python3.13-bookworm-slim` builder (`uv sync --frozen --no-dev --no-editable`), `python:3.13-slim-bookworm` runtime, non-root user, `ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1`, entrypoints `uvicorn learny_api.main:app --host 0.0.0.0 --port 8000 --workers ${PY_API_WORKERS:-2} --timeout-graceful-shutdown 30` and `python -m learny_worker`. Build twice in CI and compare the image config digest of the venv layer (reproducibility check of CA-4).

### Pitfalls
- Starlette `StreamingResponse(headers=dict)` drops duplicate `Set-Cookie`: always set `raw_headers`.
- Do not let FastAPI add its default exception handlers' bodies: register handlers for `HTTPException`/`RequestValidationError`/`Exception` that produce the TS problem bodies (404 `Ressource introuvable.`, 405 with `Allow`).
- `uvicorn --proxy-headers` must stay **off**: forwarded headers are trusted only through the proxy secret, as in TS.
