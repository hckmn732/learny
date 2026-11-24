# P22 plan — business contexts (SPEC-2201 → SPEC-2206) and jobs cutover (SPEC-2207)

Exit state (CP-22): every operation, special route, consumer and cron in `api/ownership.yaml` is `py`; the full e2e/visual/cross-browser suite is green with Hono only relaying nothing; every TS backend test has a green Python twin. Production is still 100 % TypeScript (P23 moves it).

Dependency order: 2201 → (2202 ∥ 2203) → (2204 after 2202+2203) ∥ (2205 after 2202) → 2206 → 2207.

---

## The per-context recipe (identical for 2201 → 2206)

For each spec, in this order, one commit (or a few) per step:

1. **Scope** — filter `api/inventory.json` by target context: operations, special routes, use cases called by jobs, events produced, tests. Paste the list in `evidence/<spec>/scope.md`. This is the checklist of the spec.
2. **Domain** — port pure logic to `learny/<ctx>/domain/` with unit tests replaying `api/oracles/vectors/*` (exact equality after the TS rounding rules). Skip if the context has no pure logic.
3. **Queries** — port SQL into `learny/<ctx>/infrastructure/queries.py`:
   - raw `sql\`…\`` blocks: copy verbatim, convert `${x}` to `:x` bound parameters;
   - Drizzle builder calls: write the equivalent SQL by hand, keep column order and `order by` exactly;
   - keep every `for update`, advisory lock, `on conflict` and `set_config('learny.actor', …)` the TS code has.
   Each query function takes `tx: Tx` as first parameter and returns a frozen dataclass row or a generated model.
4. **Use cases** — `learny/<ctx>/application/<topic>.py`, one async function per TS service function, signature `(deps, actor, ...)`. Same event names, payloads and ids via `tx.emit`. Same `AppError` codes and `locale_fr.details` texts. Export what other contexts/apps need through `public.py`. **Use cases that jobs call are ported here too** (they are wired to the worker in SPEC-2207).
5. **Handlers** — `apps/api/src/learny_api/handlers/<ctx>.py`, one `@handler("<route id>")` per operation, no logic.
6. **Tests** — port the TS unit/integration tests listed for the context in `test-port-map.md` (same cases), add `[SPEC-xxxx]` tags; update the map.
7. **Parity** — with a local override (`OWNERSHIP_OVERRIDES` in a test env file) set the context to `py`, run `pnpm parity:check --group <ctx>`; fix Python until zero unexplained divergence.
8. **Flip** — commit `api/ownership.yaml` with the context's entries at `py`; run the e2e tests of the specs listed in the scope (grep `@SPEC-` tags from the inventory) and then the full e2e + visual suite through the facade.
9. **Evidence** — `parity.md` (operation → use case → BR rules → tables → tests → parity result), `test-port-map.md` updated, `acceptance.md`.

### First-use rule for shared building blocks
When a use case needs a capability owned by a context that is not ported yet (e.g. formation needs `notify` from engagement, assessments need `bricks` grading), port **that building block inside its owning context** at first use (code in `learny/engagement/...`, tests included), expose it in that context's `public.py`, and list it in the scope. The owning spec later ports the rest of its context and the HTTP routes. Never duplicate the logic in the caller.

### Cross-runtime facts during P22
- The database is shared: TS jobs (still owning all consumers until 2207) read rows written by Python use cases — keep exact column semantics.
- E2E runs `JOBS_MODE=inline`: Python runs py-owned consumers in-process and bridges ts-owned ones to Hono (P21 §2102 step 6).

---

## SPEC-2201 — identity + formation (50 operations)

Also builds **`learny.platform.llm`** (first user: scoping and programme generation).

### Identity specifics
- Auth routes (`auth` 6): Set-Cookie headers must be byte-identical to what `@supabase/ssr` writes today (name `sb-<ref>-auth-token`, chunking at the library's chunk size, `base64-` prefix, `Path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` except localhost, `Max-Age`) — compare with the `supabase-cookies` vectors and parity recordings. GoTrue error → problem code mapping copied from TS.
- Special `auth-callback` (302) and email confirmation redirects.
- `me`, `security`, `legal`, profile/preferences settings: straightforward CRUD under RLS; `legal_acceptances` is append-only (trigger) — inserts only.
- `header`, `sidebar`, `home`: implement in `learny/views/` (read-only SQL under RLS).

### Formation specifics
- `cadrage` (scoping chat): `session.object` equivalent with the scoping schema; mock fixtures selection must pick the same fixture as TS (promptId + `match.contains` + `[[mock:x]]` markers).
- `programme`: generation with web search allowed (programme task only), JSON parsing + correction re-prompts as in TS; proposals versioned; validation emits `formation/programme-validated` (consumed by `plan-programme`, TS until 2207).
- `formations-a-plusieurs` → `learny/formation` group sub-module: invite code `LRN-XXXX`, max 10 members, owner rules enforced also by DB triggers.
- `notion-graph`: `validate_notion_link` trigger refuses cycles — surface the same error mapping.
- `search` (`search_user_content` SQL function): call the function, do not re-implement.

### `learny.platform.llm` (port of `packages/llm`)
- `LlmGateway` protocol with three calls mirroring `session.ts`: `step(...)` (text + tool calls, tools declared strict but never executed here), `object(schema, ...)` (structured output validated against the JSON schema, optional streaming), `stream(...)` (text deltas).
- Adapters: `AnthropicAdapter` (anthropic SDK: adaptive thinking/effort, ≤ 4 cache breakpoints, Files API, citations — port the request rewriting of `anthropic-fetch.ts`), `OpenAICompatibleAdapter` (openai SDK with `base_url` for openai, mistral, deepseek, openai_compatible, local; `response_format: json_schema` strict, strict tools).
- Task table (`tasks.ts`): programme (high effort, 32k out, 180 s, web search), course (medium, 64k, 300 s), gaps (16k, 120 s), tutor (low, 8k, 60 s), light (4k, 30 s, vision); > 16k output streams on the provider side.
- BYOK resolution: `ai_task_models` ⨝ `ai_credentials`, AES-256-GCM `iv12|tag16|ct` with AAD `learny:ai_credentials:<credId>:<userId>` (`cryptography` returns `ct||tag`: reorder), `APP_ENCRYPTION_KEY`/`_PREVIOUS`, lazy re-encryption on read, HMAC fingerprint, `AI_UNAVAILABLE` reasons.
- Mock mode: read the **same fixture files** `packages/llm/fixtures/<task>/<scenario>.json` (moved in SPEC-2302), same selection order (explicit scenario → `[[mock:x]]` → promptId + `match.contains` → `<promptId>.default.json` → `MOCK_FIXTURE_NOT_FOUND`), deterministic step player.
- `ai_calls` logging row per call (tokens, latency, status, `costUsd=0`, `managed=false`); budget-reservation code is dead in TS (ADR-0340) — do not port it.
- Web search: Anthropic native `web_search` when supported, else Tavily via httpx (`SEARCH_API_KEY`), else `SEARCH_UNAVAILABLE`; public URLs only, HTML stripped, dedup, token budget.

---

## SPEC-2202 — learning + assessments (41 operations)

- **Learning engine** → `learny/learning/domain/` (fsrs, mastery, gaps, draw, global_quiz, planner, metrics, streak, milestones, warmup, session, prng, params). Rules: pure functions, `now` parameter, vectors from SPEC-2001 + hypothesis properties ported from the fast-check ones.
- **FSRS**: port the subset of `ts-fsrs` 5.4.2 actually used (scheduler, parameters, rounding) into `learny/learning/domain/fsrs.py`. Do not depend on the `fsrs` PyPI package (different defaults/rounding risk). Card JSON stored in `notion_states` must round-trip byte-compatible with what ts-fsrs writes (field names, date format).
- **Bricks** (13 types) → `learny/assessments/domain/bricks/`: schema validation, grading, SHA-256 fingerprint, public payload, deterministic shuffle — vectors from SPEC-2001. `packages/bricks` stays for the web (views).
- Quiz/attempt/answer flows, exercises, mock exams (deadline handled by the `exam-deadline` job: port `submit_exam` use case here), offline sync receipts (server recomputes FSRS; server wins — BR-PLA-01), agenda/replan (planner), warmups, reviews, gaps, streaks/milestones, final review.
- Append-only journals: write through `append_review_log` / `append_gap_event` SQL functions (security definer), never direct inserts.
- Advisory locks in activities/agenda: copy keys.
- Use cases for jobs ported here: `grade_quiz`, `submit_exam_at_deadline`, `plan_programme` (learning), `unlock_module` (formation is already ported; put it in `formation`), `purge_offline_receipts`.

---

## SPEC-2203 — content (19 operations)

- Resources/uploads: upload token minting (P21 storage), limits enforced by `enforce_resource_limits` trigger (map its errors), soft delete triggers.
- `process_resource` use case (job `ingest-resource`, ported here, wired in 2207) as a **resumable handler**: status `queued → processing → ready|failed`; steps load, extract, chunk, embed, finalize; chunks replaced atomically in one transaction; state-transition guard replaces Inngest `concurrency resourceId/1`.
- Extraction: pdf → `pypdf` page by page (≤ 50 MB, ≤ 500 pages; in live mode also upload to Anthropic Files API as TS does); web → `learny.platform.safe_fetch` + `readability-lxml`; youtube → `youtube-transcript-api` captions only (no captions = permanent failure, ≤ 5000 segments, ≤ 12 h); image → vision model of the `light` task; note → text. Other kinds → `RESOURCE_UNSUPPORTED`.
- **Extraction parity**: run TS and Python extractors on every fixture of `packages/ingestion` tests; compare whitespace-normalised text per page. Residual differences that change chunk boundaries or citations → record them in an ADR with the fixture list (the only accepted kind of deviation in this context).
- Chunking: ~800 tokens, 100 overlap, 4 chars/token, paragraph boundaries, never across pages, offsets/page/timestamps kept — exact port, vectors.
- Embeddings: Voyage `voyage-4-lite`, 1024 dims, `input_type: document`, batches of 64, via httpx; mock = SHA-256 L2-normalised vector (vectors).
- `safe_fetch` (port of `packages/core/src/net/*`): http/https, URL ≤ 2048, ports 80/443, resolve DNS and block private ranges (copy `ip-ranges.ts`), connect to the checked IP with `httpx` and `extensions={"sni_hostname": host}` + `Host` header, manual redirects (≤ 5, each re-checked), 15 s total, 5 MB streamed cap, robots.txt for `LearnyBot` (`urllib.robotparser`), blocked suffixes.
- Course reading, sections, revisions (`set_config('learny.actor','learner', true)` before edits), citations, summaries.
- Vector search: same SQL (`embedding <=> :vec::extensions.vector`, `set local hnsw.ef_search = 40`), bind vectors with `pgvector`.

---

## SPEC-2204 — tutor (12 operations, the hardest)

- **SSE writer** (`apps/api/src/learny_api/sse.py`): AI SDK UI message stream v1, chunks `data: <jsonx.dumps(chunk)>\n\n` in the exact order `start{messageId}`, `text-start{id}`, `text-delta{id,delta}`…, `text-end`, `data-sources`, `data-follow-ups` | `data-self-test`, `finish`, then `data: [DONE]`. Mid-stream failure → `{"type":"error","errorText": locale_fr.stream.ANSWER_FAILED}` then close. Headers `text/event-stream; charset=utf-8`, `cache-control: no-store`, `x-vercel-ai-ui-message-stream: v1`. Errors before the first byte are problem+json (including 409 when the conversation is already streaming).
- Streaming lock: per-process set of conversation ids (TS keeps it in memory per instance) — same semantics, no distributed lock.
- Persistence order: learner message committed before the model call; tutor message (sources, follow-ups, self-test) after the full stream. **Client disconnect**: read `packages/services/src/tutor-chat/stream.ts` and mirror exactly what happens to the model call and to persistence when the client cancels (if TS keeps consuming and persists, run the remainder in a shielded task).
- History: last 20 messages + summary of older ones; prompt building (`context.ts`): cached stable system prompt + uncached profile part, `<document source chunk>`, `<task_context>`, `<learner_message>` wrappers, `escape_tutor_data` (entity-encode `& < > " '`, neutralise `[[mock:]]`).
- Agent loop `run_tutor` (port of `loop.ts`): ≤ 12 turns; per tool call: unknown → `TOOL_UNKNOWN`, input validation, guard (authorisation), execute, output validation, all inside one RLS transaction; ≤ 2 brick corrections; two consecutive validation errors → `invalid_output` + `ai_task_failed` notification.
- Tools (10, per-task allowlist) → `learny/tutor/infrastructure/tools/`: port `tools/runtime.ts` SQL verbatim (1.4k lines — split by tool, keep statements identical).
- Mock scenario selection (`scenarioFor` regex heuristics) ported with the same regexes (convert JS regex syntax carefully; add tests per regex).
- `looks_injection` (self-test) regexes — same care.
- Prompts: read `packages/tutor/prompts/*.md` at startup (front matter + body) — same files, no copy until SPEC-2302.
- Use cases for jobs ported here: `generate_course` (resumable, emits `course/generated` + `notification/requested`), `prepare_question_bank`, `process_question_bank_jobs` (nightly), `prepare_remediation` (auto/manual).
- `ai-credentials` + AI model settings routes: encrypt/rotate/qualification run (connection, strict tool call, structured output, 13 brick types).

---

## SPEC-2205 — engagement (28 operations)

- `notify` (probably already ported at first use): routing pure function (per-type/per-channel preferences, quiet hours 21:00–08:00, weekend quiet), daily cap 3/5/8 counted per local day under an advisory lock, dedupe `(user_id, dedupe_key)`, `notification_deliveries` per channel, `notification/delivery-due` event.
- Email: Resend (httpx) in production, SMTP (aiosmtplib) to Mailpit locally, memory in tests (`EMAIL_MODE`). **Templates**: render the 8 React Email templates × (vous, tu) with representative data from TS into `api/oracles/emails/*.html|.txt` (TS script), then write Jinja2 templates in `learny/engagement/templates/email/` producing identical output after whitespace normalisation. List-Unsubscribe headers and HMAC unsubscribe tokens (vectors).
- Push: `pywebpush` with VAPID; remove the subscription after 404/410 or 5 failures.
- Unsubscribe HTML pages (special route) → Jinja2, server-side i18n strings from `@learny/i18n` copied into `locale_fr`.
- Automations engine (10 automations, keys stay French values): contract `triggers/params/run/explain/apply/undo`, `automation_actions` with dedupe key and consent state; production only exposes accept/decline/undo, direct calls and sprints (special route) — hourly/nightly/event triggers are not wired in TS production, do not wire them.
- Use cases for jobs ported here: `deliver_notification`, `deliver_due_deliveries`, `send_daily_digest` (+ `due_in_window`), `sync_validation_quiz_reminders`, `send_welcome_email`, `expire_due_automation_actions`.

---

## SPEC-2206 — billing + privacy (12 operations + dev-billing 4)

- Stripe webhook (special handling inside the pipeline: raw body ≤ 1 MiB, no JSON validation before signature): `stripe.Webhook.construct_event(payload, sig, secret, tolerance=300)`; mock mode verifier ported from `mock-stripe.ts`; `stripe_events` insert `on conflict do nothing` → `duplicate`; stale events dropped; subscription re-read from Stripe; response `{received: true, result}`; missing secret → 503, bad signature → 400 `INVALID_SIGNATURE`.
- `dev-billing` routes (4) move with billing.
- Privacy orchestration: each context exposes `export_personal_data(deps, user_id) -> dict` and `delete_personal_data(deps, user_id) -> Receipt` in its `public.py`; `learny/privacy` orchestrates.
- `run_data_export` (job `data-export`, 15 min): resumable steps load → collect → zip (`zipfile`, streamed to a temp file) → upload (service-role storage) → finalize → notify; idempotency by `exportId`.
- `run_account_deletions` (nightly, 50 due profiles, per-user steps `deletion:<uid>:<step>` resumable by persisted progress), `purge_exports`.

---

## SPEC-2207 — jobs & crons cutover, dev/demo routes

### Consumer mapping (wire all of them in `consumers.py`, then flip `consumers` + `crons` to `py`)

| Inngest function | Trigger | Python consumer | Use case | Options |
|---|---|---|---|---|
| cron-hourly-tick | `5 * * * *` UTC | scheduler hourly task | `expire_due_automation_actions`; emit `user/local-tick` per active user (pages of 500, kept for parity); emit `cron/hourly-tick` | outbox resend is **not** ported (the dispatcher polls) |
| cron-nightly | `30 1 * * *` UTC | scheduler nightly task | emit `cron/nightly{runDate}` | |
| account-deletion | cron/nightly | `privacy.run_account_deletions` | privacy | idempotent per runDate |
| exports-purge | cron/nightly | `privacy.purge_exports` | privacy | |
| nightly-outbox-cleanup | cron/nightly | `shared.purge_outbox` | delete sent/dispatched rows > 7 days (cascades deliveries) | |
| offline-receipts-purge | cron/nightly | `assessments.purge_offline_receipts` | > 30 days | |
| question-bank-nightly | cron/nightly | `tutor.process_question_bank_jobs` | limit 50 | timeout 900 s |
| security-purge | cron/hourly-tick | `identity.purge_security_rows` | idempotency keys + rate-limit buckets > 24 h | |
| notifications-daily-digest | cron/hourly-tick | `engagement.plan_daily_digests` → emits `job/daily-digest{userId, at}` per due user | `due_in_window` | |
| (new, internal) | job/daily-digest | `engagement.send_daily_digest` | `send_daily_digest` | `run_at = data.at` (replaces `step.sleepUntil`) |
| notifications-deferred-due | cron/hourly-tick | `engagement.deliver_due_deliveries` | `list_due_deliveries(100)` | |
| notifications-reminders | cron/hourly-tick | `engagement.sync_validation_quiz_reminders` | batch 200 | |
| data-export | account/export-requested | `privacy.run_data_export` | resumable | timeout 900 s |
| email-welcome | user/signed-up | `engagement.send_welcome_email` | | |
| notification-delivery | notification/delivery-due | `engagement.deliver_notification` | | |
| ingest-resource | resource/uploaded | `content.process_resource` | resumable, state guard | timeout 600 s |
| generate-course | chapter/contributions-completed | `tutor.generate_course` | state guard per module | timeout 600 s |
| prepare-question-bank | course/generated | `tutor.prepare_question_bank` | | |
| plan-programme | formation/programme-validated | `learning.plan_programme` | | |
| quiz-grade | quiz/submitted | `assessments.grade_quiz` | state guard per attempt | timeout 300 s |
| exam-deadline | exam/started | `assessments.submit_exam_at_deadline` | | `run_at = deadlineAt + 5 s` |
| module-unlock | quiz/graded | `formation.unlock_module` | | |
| remediation-prepare | quiz/graded | `tutor.prepare_remediation` (auto; skip when passed) | | |
| remediation-prepare-requested | remediation/requested | `tutor.prepare_remediation` (manual) | | |

- `job/daily-digest` is the only new event; add it to `api/events.schema.json` (internal, documented in ADR-2014).
- Inngest `concurrency` keys with limit 1 become state-transition guards in the use case (already done in the context specs); limits > 1 (per-user 5) are throughput controls and are dropped (no observable behaviour).
- Inngest `idempotency` CEL keys become the delivery primary key + the business idempotency of the use case.

### Flip procedure (dev/test)
1. Set all `consumers` and `crons` to `py` in `ownership.yaml`.
2. Hono runs with `LEARNY_API_ROLE=api` in the Playwright config (no `/api/inngest`), TS inline jobs no longer have TS emitters (all HTTP is `py`).
3. Remove the inline bridge (P21) and the dev-only dispatch route if it was added.
4. Run worker integration tests with each consumer, then the full e2e suite.

### Dev/demo routes (51) and remaining special routes
Port `dev`, `dev-migration`, `dev-sdd-migration` (43 demo routes of old specs, still used by e2e demo pages) and the `_dev` tools/relay-stream special routes into `apps/api/src/learny_api/special/dev_*.py` (dev-only guard `ENABLE_SDD_PAGES && APP_ENV != production`, allowed to use `service_tx`). They are thin; port them verbatim.

At the end of 2207 the facade relays **nothing**; Hono is still started by Playwright only as a safety net until SPEC-2302.
