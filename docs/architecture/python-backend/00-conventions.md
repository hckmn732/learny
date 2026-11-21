# 00 — Conventions and patterns (applies to every SPEC-2xxx)

Everything here is binding for the Python backend. Section numbers are referenced from the phase plans.

## 1. Language policy (ADR-2011)

- **English**: module/package names, identifiers, comments, docstrings, log messages and log field names, exception class names, test names, Python READMEs, `TODO`s, internal error `detail` that never reaches a user (e.g. contract violations logged server-side).
- **French, verbatim from TypeScript**, and only in these places:
  - `packages-py/learny/src/learny/shared/locale_fr/` — Python modules holding user-facing strings: `errors.py` (problem titles, generated from `api/errors.json`), `details.py` (problem `detail` texts thrown by services), `validation.py` (Zod-equivalent validation messages), `stream.py` (SSE `errorText`), `notifications.py` (in-app/push texts).
  - Jinja2 templates under `learny/engagement/templates/` (emails, unsubscribe pages).
  - Never in code paths: code references `locale_fr.details.FORMATION_NOT_FOUND`, never an inline French literal.
- Enforcement: `packages-py/learny/tests/unit/test_language_policy.py` fails if a `.py` file outside `locale_fr/` contains non-ASCII letters or one of a small list of French stop words in string literals (`" de la "`, `" introuvable"`, `"Une erreur"`, …).
- SDD artefacts (specs, ADRs, `evidence/*/acceptance.md`, commit messages) keep the repository convention (French, `docs/engineering/git.md`).
- LLM prompts are already English (`packages/tutor/prompts/*.md`); keep them byte-identical.

## 2. Repository layout

```
pyproject.toml                 # uv workspace root: members, ruff/mypy/pytest/import-linter config
uv.lock                        # committed; `uv sync --frozen` everywhere
.python-version                # 3.13
api/
  openapi.yaml                 # contract source (SPEC-2002), with x-learny extensions
  errors.json                  # error catalog: code -> {status, title, type} (generated once from TS)
  events.schema.json           # 49 event payload schemas (generated once from TS)
  ownership.yaml               # owner (ts|py) per operation, special route, consumer, cron (ADR-2005)
  contract-exceptions.yaml     # accepted contract deviations, each with an ADR id (normally empty)
  oracles/                     # parity scenarios + recordings (SPEC-2001)
apps/api-py/
  pyproject.toml               # project "learny-api"
  src/learny_api/
    main.py                    # create_app(); `learny_api.main:app` for uvicorn
    pipeline.py                # the generic contract pipeline (§6)
    relay.py                   # transparent relay to Hono for ts-owned entries (spikes.md §A)
    ownership.py               # loads/validates api/ownership.yaml (+ OWNERSHIP_OVERRIDES env)
    auth.py                    # HTTP identity resolution -> learny.identity.public
    sse.py                     # AI SDK UI message stream v1 writer
    generated/                 # NEVER edited by hand
      routes.py                # RouteSpec table from openapi.yaml
      models.py                # Pydantic models from openapi.yaml
      events.py                # Pydantic models from events.schema.json
    handlers/                  # one module per context: identity.py, formation.py, ...
    special/                   # health.py, openapi.py, auth_callback.py, unsubscribe.py, dev_*.py
  tests/{unit,integration}/
apps/worker-py/
  pyproject.toml               # project "learny-worker"
  src/learny_worker/
    __main__.py                # `python -m learny_worker`
    dispatcher.py              # event_outbox -> job_deliveries fan-out
    runner.py                  # claim / lease / execute / retry loop
    scheduler.py               # cron ticks under an advisory lock
    consumers.py               # CONSUMERS registry (one line per consumer)
    inline.py                  # JOBS_MODE=inline execution used by API in tests
  tests/{unit,integration}/
packages-py/learny/
  pyproject.toml               # project "learny" (library)
  src/learny/
    shared/                    # clock, errors, jsonx, config, logging, db (engine, uow, privileged), outbox, crypto, ids, locale_fr/
    platform/                  # technical capabilities used by several contexts: llm, embeddings, email, push, storage, stripe, search, safe_fetch
    identity/ formation/ learning/ assessments/ content/ tutor/ engagement/ billing/ privacy/
      public.py                # the ONLY module other contexts / apps may import
      domain/                  # pure rules (only if the context has pure logic)
      application/             # use cases (async functions)
      infrastructure/          # SQL query modules, context-specific adapters
    views/                     # read-only aggregations across contexts (home, header, sidebar, search...)
  tests/{unit,integration}/<context>/
docker/api-py.Dockerfile       # one image, two commands (api, worker)
```

`views/` exists to avoid contorted cross-context calls for screens that aggregate (home, header, sidebar, search, agenda views): query-only SQL under RLS, no writes, no rules. Contexts never import `views`.

## 3. Layers and dependency rules (ADR-2003, enforced by import-linter)

```
apps (learny_api, learny_worker) ──► learny.<ctx>.public / learny.views / learny.shared / learny.platform
learny.<ctx>.infrastructure ──► application ──► domain
learny.<ctx>.application ──► learny.<other>.public, learny.platform (protocols), learny.shared
learny.<ctx>.domain ──► stdlib + learny.shared.{clock types, errors} only
```

Import-linter contracts (validated in spikes.md §D) in the root `pyproject.toml`:

```toml
[tool.importlinter]
root_packages = ["learny", "learny_api", "learny_worker"]
include_external_packages = true

[[tool.importlinter.contracts]]
name = "Layers inside each context"
type = "layers"
containers = ["learny.identity", "learny.formation", "learny.learning", "learny.assessments", "learny.content",
              "learny.tutor", "learny.engagement", "learny.billing", "learny.privacy"]
layers = ["infrastructure", "application", "domain"]

[[tool.importlinter.contracts]]
name = "Domain is pure"
type = "forbidden"
source_modules = ["learny.*.domain"]
forbidden_modules = ["sqlalchemy", "psycopg", "fastapi", "starlette", "httpx", "anthropic", "openai", "stripe", "learny.platform"]

[[tool.importlinter.contracts]]
name = "Contexts talk through public modules only"
type = "independence"
modules = ["learny.identity", "learny.formation", "learny.learning", "learny.assessments", "learny.content",
           "learny.tutor", "learny.engagement", "learny.billing", "learny.privacy"]
ignore_imports = ["learny.** -> learny.*.public"]
unmatched_ignore_imports_alerting = "none"   # required: the clean tree would otherwise fail (spikes.md §D)

[[tool.importlinter.contracts]]
name = "Nobody imports views or apps"
type = "forbidden"
source_modules = ["learny.identity", "learny.formation", "learny.learning", "learny.assessments", "learny.content",
                  "learny.tutor", "learny.engagement", "learny.billing", "learny.privacy", "learny.platform", "learny.shared"]
forbidden_modules = ["learny.views", "learny_api", "learny_worker"]
```

## 4. Patterns to use — and anti-patterns that are forbidden

### Use

| Need | Pattern | Shape |
|---|---|---|
| A business operation | **Use case = one async function** in `application/` | `async def submit_quiz(deps: Deps, actor: Actor, body: SubmitQuizBody) -> SubmitQuizOutput` |
| Dependencies | **One frozen `Deps` dataclass** built once at startup (`learny.shared.deps`) and passed explicitly | fields: `settings, clock, db, llm, embeddings, storage, email, push, stripe, search, logger` |
| Database access | **Query module** per context in `infrastructure/queries.py`: SQL constants + small async functions taking a connection | `async def get_attempt(tx: Tx, attempt_id: str) -> AttemptRow | None` |
| Transactions + events | **Unit of work** from `deps.db` | `async with deps.db.user_tx(actor) as tx: ...; await tx.emit("quiz/submitted", data)` |
| Pure rules | **Pure functions + frozen dataclasses** in `domain/` | no IO, `now` passed as a parameter |
| External services | **Protocol + adapters + mock** in `learny.platform.<capability>` selected from settings (`LLM_MODE`, `EMAIL_MODE`, `STRIPE_MODE`, `PUSH_MODE`, …) | `class EmailSender(Protocol): async def send(self, msg: EmailMessage) -> None` |
| Errors | **Raise `AppError(code, detail=..., status=None, retry_after=None, **extra)`**; no Result type | the pipeline maps it to problem+json |
| Background work | **Consumer = one async function** registered in `learny_worker/consumers.py` and calling a use case | `Consumer("assessments.grade_quiz", on="quiz/submitted", run=grade_quiz_job, timeout_s=300, max_attempts=4)` |
| Long multi-step jobs | **Resumable handler**: each step reads persisted state and skips completed work; progress is stored in business tables | no generic step engine |
| Mutual exclusion on an aggregate | **State-transition guard** (`update ... set status='processing' where id=:id and status='queued' returning id`) or `pg_advisory_xact_lock` as TS does | no distributed locks |
| DTOs | **Generated contract models** (`learny_api.generated.models`) are the input/output types of use cases that serve an HTTP operation | no hand-written duplicates |

### Forbidden (unless an ADR says otherwise)

- ORM mapped classes, generic repositories, `Repository[T]` base classes, unit-of-work abstractions beyond `deps.db.user_tx/service_tx`.
- Dependency-injection containers or frameworks (dependency-injector, punq…), service locators, global mutable singletons (the only module-level state is the `Deps` built in `create_app()` / worker `main`).
- FastAPI `Depends` chains for business logic; FastAPI request-body parsing (the pipeline validates, §6).
- CQRS buses, mediators, event sourcing, domain events classes hierarchies, sagas frameworks.
- Abstract base classes with one implementation; interfaces "for later".
- LangChain, LiteLLM, PydanticAI, Celery, Dramatiq, Temporal, Inngest SDK, Alembic (schema stays in `packages/db/migrations`).
- Microservices, extra processes beyond `api` and `worker`, caches (Redis…) — not needed for parity.
- Rewriting SQL "more elegantly": port the TS SQL first, optimise only with a measured reason.
- Helper modules named `utils.py`/`helpers.py`/`common.py`: name the module after what it does.

## 5. Libraries (ADR-2015)

Versions resolved together on Python 3.13 on 2026-11-21 (spikes.md §E). `uv.lock` is the source of truth; upgrade only with a reason.

| Purpose | Library | Version seen | Notes |
|---|---|---|---|
| Web | fastapi, starlette, uvicorn[standard] | 0.165.0, 1.10.0, 0.54.0 | FastAPI used as app + router only |
| Models/settings | pydantic, pydantic-settings | 2.14.4, 2.16.3 | settings read the **same env var names** as TS |
| DB | sqlalchemy[asyncio], psycopg[binary,pool], pgvector | 2.1.9, 3.3.9, 0.5.1 | `connect_args={"prepare_threshold": None}` |
| HTTP client | httpx | 0.28.1 | also for Supabase Auth/Storage REST, Voyage, Resend |
| Logs/errors | structlog, sentry-sdk[fastapi] | 26.1.0, 2.75.0 | JSON logs |
| Auth/crypto | pyjwt[crypto], cryptography | 2.15.1, 50.0.2 | JWKS + HS256; AES-256-GCM |
| LLM | anthropic, openai | 2.12.0, 3.57.0 | `openai` SDK also drives Mistral, DeepSeek, openai_compatible, local via `base_url` |
| Billing | stripe | 17.1.0 | `Webhook.construct_event`, tolerance 300 s |
| Notifications | pywebpush, aiosmtplib, jinja2 | 2.5.0, 5.1.3, 3.1.6 | Resend through httpx (no SDK) |
| Ingestion | pypdf, readability-lxml (+lxml_html_clean), youtube-transcript-api | 7.1.1, 0.9, 1.2.5 | parity measured on fixtures (P22 §2203) |
| Time zones | tzdata | 2026.6 | `zoneinfo` with pinned tzdata |
| Tests | pytest, pytest-asyncio, pytest-cov, hypothesis | 9.2.0, 1.5.0, 7.1.1, 6.170.17 | `asyncio_mode = "auto"` |
| Quality | ruff, mypy, import-linter | 0.17.6, 2.4.1, 2.17 | mypy `strict` on `learny.*.domain` and `learny.*.application` |
| Codegen | datamodel-code-generator | 0.99.0 | options in P20 §2003 (spikes.md §F) |

No other runtime dependency without an ADR.

## 6. HTTP: the contract pipeline (ADR-2012)

`api/openapi.yaml` carries, per operation, an `x-learny` object emitted by SPEC-2002 from `defineRoute`:
`{id, auth: user|public, rateLimit: default|ai|auth|none, idempotent, requiresIdempotencyKey, freshAuth, legalAcceptance, validationStatus: 400|422, successStatus}`, plus named component schemas `<RouteIdPascal>Params|Query|Body|Output`. `generated/routes.py` turns this into `ROUTES: tuple[RouteSpec, ...]`.

Handlers register by route id and stay thin:

```python
# apps/api-py/src/learny_api/handlers/assessments.py
from learny_api.pipeline import handler, Call
from learny.assessments import public as assessments

@handler("attempts.submit")
async def submit_attempt(call: Call) -> object:
    return await assessments.submit_attempt(call.deps, call.actor, call.params.attemptId, call.body)
```

`pipeline.py` reproduces `packages/http/src/route-handler.ts` **in the same order** (P20 §2003 lists the 12 steps). Rules:
- Request bodies are read as bytes (1 MiB cap → 413), parsed with `json.loads`, validated with the generated model in **strict mode for JSON bodies**, lax for path/query (strings), producing a Zod-shaped `errors[]` through `locale_fr/validation.py`.
- Output is validated against the generated output model; failure → 500 problem with `contract_violation` logged (same as TS).
- `formations.access` is forced to 204 (TS quirk) — keep it.
- FastAPI is used to host the app; routes are registered with `app.add_api_route(path, endpoint, methods=[m], include_in_schema=False)`. `/openapi.json` and `/api/v1/openapi.json` serve the contract file converted to JSON exactly like today.
- Response headers: `x-request-id`, `cache-control: no-store` for user routes, `server-timing: app;dur=N`, merged cookies/extra headers, `x-served-by: learny-api`.

## 7. Data conventions

- **JSON output** goes through `learny.shared.jsonx.dumps(obj) -> bytes`: `ensure_ascii=False`, `separators=(",", ":")`, dict insertion order preserved (mirror the TS object literal order), numbers formatted like JavaScript (`js_number`: `1.0 -> "1"`, `1e-7 -> "1e-7"`, `1e21 -> "1e+21"`, shortest round-trip otherwise), datetimes like `Date.prototype.toISOString()` (`2026-11-11T12:20:00.000Z`, always milliseconds, always `Z`). Test vectors live in `tests/unit/shared/test_jsonx.py` and are produced from Node in SPEC-2001.
- **Canonical JSON** (`learny.shared.jsonx.canonical`) reproduces `packages/db/src/schema/privacy-search.ts` `canonicalJson`: keys sorted by **UTF-16 code units** (`key.encode("utf-16-be")` comparison), `None` members omitted, JS number formatting, non-finite numbers rejected. Used for event ids (`name:sha256(canonical(data))[:32]`) and idempotency request hashes — both must be identical across runtimes.
- **Boundary string formats stay strings**: `date-time`, `date`, `uuid`, `email`, `uri` are `str` with the contract `pattern` (codegen `--type-mappings`, spikes.md §F). Convert to `datetime` only inside use cases via `learny.shared.time.parse_iso`.
- **Time**: `deps.clock.now()` only (`Clock` protocol; `FixedClock` from `CLOCK_FIXED_AT`, `SystemClock` otherwise). `datetime.now()`, `time.time()` for business are forbidden (ruff `DTZ` rules + a banned-api rule). Database `now()` may be used only for infrastructure timestamps (leases, `created_at` defaults) exactly where TS lets the DB decide.
- **IDs**: UUIDv4 strings via `learny.shared.ids.new_id()` (TS uses `crypto.randomUUID`).
- **Floats** in learning computations: same operations in the same order as TS; when TS rounds, round the same way: `learny.shared.jsmath.js_round(x) = math.floor(x + 0.5)` mirrors `Math.round` (half towards +∞: `Math.round(2.5) == 3`, `Math.round(-2.5) == -2`), unlike Python's banker's `round`. `toFixed(n)` gets its own helper with Node-generated test vectors.
- **Randomness**: only the seeded PRNG ported from `packages/learning-engine` (32-bit integer arithmetic emulated with `& 0xFFFFFFFF`), never `random`.

## 8. Configuration

`learny.shared.config.Settings(BaseSettings)` reads the **existing env var names** (no renaming): `DATABASE_URL`, `DATABASE_POOL_MAX`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `APP_ENV`, `APP_ENCRYPTION_KEY(_PREVIOUS)`, `API_PROXY_SECRET(_PREVIOUS)`, `TRUST_PROXY`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_APP_URL`, `RATE_LIMIT_MODE`, `RATE_LIMIT_IP_SECRET`, `CLOCK_FIXED_AT`, `LLM_MODE`, `JOBS_MODE`, `EMAIL_MODE`, `STRIPE_MODE`, `PUSH_MODE`, `VOYAGE_API_KEY`, `SEARCH_API_KEY`, `ENABLE_SDD_PAGES`, `SENTRY_DSN`… — the agent copies the full list from the TS config readers (`packages/config`, `packages/*/src/**/env*.ts`). New variables only for Python-specific needs, prefixed `PY_` (e.g. `PY_HONO_UPSTREAM_URL` for the facade, `OWNERSHIP_OVERRIDES`). Same production guards as TS (e.g. `LLM_MODE=mock`, `JOBS_MODE=inline`, `RATE_LIMIT_MODE=off` refused in production).

## 9. Logging and observability

- structlog JSON to stdout; one access line per request with the **same field names as the TS request log** (copy from `packages/http/src/route-handler.ts`), `request_id` bound in contextvars.
- Never log tokens, cookies, API keys, prompts, model outputs or personal data (redaction processor with the same key list as TS).
- Sentry initialised from `SENTRY_DSN`, same environment/release tags as `apps/api/src/sentry.ts`.
- Health: `/health` (always 200 `{status, version, commit}`) and `/api/v1/health` (DB probe 2 s, 503 when degraded) with identical bodies. Worker exposes `/health/live` and `/health/ready` on `PY_WORKER_HEALTH_PORT` for Coolify only.

## 10. Testing conventions

- Layout: `tests/unit/<context>/test_<topic>.py` (no DB, no network), `tests/integration/<context>/test_<topic>.py` (local Supabase). One assertion style: plain `assert`.
- **SDD tagging**: every test module starts with a docstring containing the tag, and a module marker:
  ```python
  """[SPEC-2101] JWT verification and actor resolution."""
  import pytest
  pytestmark = pytest.mark.spec("SPEC-2101")
  ```
  `validate.mjs` (extended in SPEC-2003) selects Python test files containing `[SPEC-xxxx]`, runs them with `--junitxml`, and counts passing test cases from those files.
- Determinism: `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `TZ=UTC`, `LLM_MODE=mock` set by the root `conftest.py` (refuse to run otherwise, like `assertMockLlm`).
- DB tests: `db_tx` fixture = a service transaction always rolled back; `as_user(tx, user_id)` = savepoint + same `set_config` claims + `set local role authenticated` + `reset role` (port of `packages/db/src/testing/index.ts`). Factories are plain async functions in `tests/factories/`.
- Ported tests (ADR-2008): same cases, same expected values, test name keeps the TS title translated to English; record the mapping in `evidence/SPEC-2001/test-port-map.md` (column "python test").
- Property tests: hypothesis, `derandomize=True` profile in CI.
- Serialise DB-touching commands with `flock /tmp/learny-sdd-db.lock …` (AGENTS.md).

## 11. Parity toolkit (built in SPEC-2001, used by every later spec)

- `pnpm parity:record --group <g> --target <url>` records scenarios against Hono; `pnpm parity:check --group <g> --target <url>` replays them against the facade and diffs.
- Comparison is **semantic**: status, selected headers (`content-type`, `cache-control`, `retry-after`, `ratelimit-*`, `set-cookie` attributes, `idempotent-replayed`, `location`), parsed JSON body after normalisation rules (ids, timestamps, request ids replaced by placeholders via JSON pointers declared per scenario), emitted outbox events (`name`, normalised `data`), and for SSE the ordered list of parsed `data:` payloads.
- A divergence is never fixed by editing a recording, except when the recording itself is proven wrong against TS (re-record from TS, never hand-edit).

## 12. Git and SDD workflow for Python work

- Same loop (`start.mjs` → commits → `validate.mjs` → `complete.mjs`), branches `spec/SPEC-2xxx-slug` from `main`.
- Commit scopes `SPEC-2xxx`, French subject (repo convention), code in English.
- Before each commit: `uv run ruff format --check && uv run ruff check && uv run mypy && uv run lint-imports && uv run pytest tests/unit` on touched projects, plus the TS checks if TS files changed.
- Generated files (`apps/api-py/src/learny_api/generated/*`, `packages/api-sdk`) are committed and checked fresh in CI (`--check` modes).
