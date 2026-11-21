# Spikes — what was validated before writing this canvas

Run on 2026-11-21 on the project's dev VM (Ubuntu 26.04, Docker 29.9), in throwaway containers (`postgres:17-alpine`, `ghcr.io/astral-sh/uv:python3.13-bookworm-slim`, Python 3.13.11) on an isolated Docker network. Nothing of the existing Supabase stack was touched; containers, network, images and files were removed afterwards. The spike sources are not committed (they are not product code); their essential snippets are reproduced in the phase plans.

Resolved versions used: fastapi 0.165.0, starlette 1.10.0, sqlalchemy 2.1.9, psycopg 3.3.9, httpx 0.28.1, pydantic 2.14.4, uvicorn 0.54.0.

## A — Relay facade (FastAPI → upstream standing in for Hono)

Implementation: catch-all `api_route`, `httpx.AsyncClient.send(stream=True)`, request body streamed (`content=request.stream()`), hop-by-hop headers dropped, response headers copied through `StreamingResponse.raw_headers`, upstream closed in the generator's `finally`.

| Check | Result |
|---|---|
| SSE first chunk latency through the facade (upstream emits every 500 ms) | 79 ms → no buffering |
| `content-type` and `x-vercel-ai-ui-message-stream: v1` preserved | yes |
| Client closes after the first event → upstream generator cancelled | yes (`cancelled=true`, 1 event sent) |
| Status 201, two `Set-Cookie` headers, `x-request-id` echoed, JSON body | all preserved (2 cookies) |
| `application/problem+json` 409 passthrough | preserved |
| `x-served-by: learny-api` added | yes |

Lesson: `StreamingResponse(headers=dict)` would collapse duplicate `Set-Cookie` — use `raw_headers`.

## B — RLS through SQLAlchemy async + psycopg 3

Schema: role `authenticated`, `auth.uid()` reading `request.jwt.claim.sub`, table with a forced owner policy. Engine `pool_size=5, max_overflow=0`, `connect_args={"prepare_threshold": None}`. Each user transaction: `set_config('request.jwt.claims', …, true)`, `set_config('request.jwt.claim.sub', …, true)`, `set local role authenticated`.

| Check | Result |
|---|---|
| 20 users concurrently (`asyncio.gather`), each sees only its 2 rows | yes |
| Insert a row for another user | refused (`InsufficientPrivilege`, RLS `with check`) |
| Pooled connection after a user transaction | back to `postgres`, empty claim |

## C — Outbox fan-out and leased deliveries

300 outbox events fanned out by one statement (`update … set sent_at … returning` + `insert … select … cross join consumers`) to 2 consumers = 600 deliveries; 4 concurrent workers claiming batches of 10 with `update … where (event_id, consumer) in (select … for update skip locked) returning`, leases of 1 s; worker 1 "crashes" after its first claim (abandons 10 deliveries).

| Check | Result |
|---|---|
| Deliveries / side effects | 600 / 600 → exactly-once effects |
| Deliveries re-run after lease expiry | 10 (the abandoned batch), effects still unique |
| Work spread | 150 / 150 / 150 / 150 |
| `pg_try_advisory_lock` from two sessions | `true`, `false` → singleton scheduler works |

## D — Import boundaries with import-linter 2.17

Contracts: `layers` with containers per context, `forbidden` with wildcard `learny.*.domain` → `sqlalchemy`…, `independence` between contexts with `ignore_imports = ["learny.** -> learny.*.public"]`.

| Check | Result |
|---|---|
| Domain importing `sqlalchemy` | detected |
| Domain importing its own application layer | detected |
| Context importing another context's application | detected |
| Context importing another context's `public` | allowed (ignored import) |
| Clean tree | **fails** unless `unmatched_ignore_imports_alerting = "none"` is set on the independence contract |

## E — Dependency resolution on Python 3.13

The full candidate list (00-conventions §5) resolves together with `uv pip compile --python-version 3.13`.

## F — Pydantic models generated from the real `apps/api/openapi.json`

The document: OpenAPI 3.1.0, 195 paths, 217 operations, 1 component schema, 86 inline request bodies.

| Run | Result |
|---|---|
| datamodel-codegen defaults (+ annotated/constraints) | 12 s, 733 classes, **205 numbered name collisions** (`Correction1…17`), `datetime`/`UUID`/`EmailStr` types (167 datetime fields → re-serialisation risk), UUID patterns dropped, import fails without `email-validator` |
| with `--collapse-root-models --type-mappings date-time=string date=string uuid=string email=string uri=string time=string duration=string` | imports OK, 539 `pattern` constraints kept, no datetime/UUID/email types; still ~200 numbered nested names |

Consequences written into the canvas: keep formats as strings at the boundary; SPEC-2002 emits named component schemas per operation (`<RouteIdPascal>Params|Query|Body|Output`) so top-level generated names are stable and readable; nested numbered names are acceptable in a never-edited generated file.
