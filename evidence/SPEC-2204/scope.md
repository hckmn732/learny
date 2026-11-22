# SPEC-2204 — scope: the `tutor` context (12 operations)

Filtered from `api/inventory.json` (`generatedFrom` 65ebfec1) and `api/ownership.yaml`.

## Operations served by Python in this slice (12)

- [x] `conversations.get` — GET `/api/v1/conversations/:id` → `tutor-chat.ts` `conversationGet`
      → `learny.tutor.application.conversations.conversation_by_id`
- [x] `conversations.messages` — POST `/api/v1/conversations/:id/messages` (SSE) → `streamReply`
      → `learny.tutor.application.stream.stream_reply` + `learny_api.sse.stream_response`
- [x] `conversations.self-test.answer` — POST `/api/v1/conversations/:id/self-test/answer` →
      `answerSelfTest` → `learny.tutor.application.self_test.answer_self_test`
- [x] `courses.conversations.create` — POST `/api/v1/courses/:cid/conversations` →
      `createConversation` → `learny.tutor.application.conversations.create_conversation`
- [x] `courses.conversations.list` — GET `/api/v1/courses/:cid/conversations` →
      `listConversations` → `learny.tutor.application.conversations.list_conversations`
- [x] `me.ai.credentials.create` — POST `/api/v1/me/ai/credentials` → `createCredential`
      → `learny.tutor.application.byok.create_credential`
- [x] `me.ai.credentials.delete` — DELETE `/api/v1/me/ai/credentials/:id` → `deleteCredential`
      → `learny.tutor.application.byok.delete_credential`
- [x] `me.ai.credentials.discover` — POST `/api/v1/me/ai/credentials/discover` →
      `discoverCredentialModels` → `learny.tutor.application.byok.discover_credential_models`
- [x] `me.ai.credentials.list` — GET `/api/v1/me/ai/credentials` → `listCredentials`
      → `learny.tutor.application.byok.list_credentials`
- [x] `me.ai.credentials.qualify` — POST `/api/v1/me/ai/credentials/:id/qualify` →
      `qualifyCredential` → `learny.tutor.application.byok.qualify_credential`
- [x] `me.ai.models.get` — GET `/api/v1/me/ai/models` → `getAiModelsState`
      → `learny.tutor.application.byok.get_models_state`
- [x] `me.ai.models.update` — PATCH `/api/v1/me/ai/models` → `updateAiModels`
      → `learny.tutor.application.byok.update_models`

`api/ownership.yaml` flipped these twelve entries from `ts` to `py` in commits whose handler set is
covered by `apps/api-py/tests/unit/test_handlers.py` (`py_operations == HANDLERS`, 12/12). The five
conversation entries were flipped with their handlers and the SSE writer; the seven BYOK entries were
flipped together with the seven handlers of `handlers/tutor.py`.

`me.ai.task-models.update` stays `py` but belongs to the `identity` context (SPEC-2201): the BYOK
slice does not touch it.

## Tables read or written

`tutor_conversations`, `tutor_messages`, `courses`, `chapters`, `formations`, `modules`,
`profiles`, `reading_progress`, `resources`, `resource_chunks`, `notions`, `notion_states`,
`course_sections` (reads), `bricks`, `brick_versions`, `activities`, `attempts`, `answers`,
`schedule_slots` (Teste-moi), and for the BYOK slice `ai_credentials` and `ai_task_models`
(reads and writes, always under RLS).

## SQL module of the BYOK slice

`learny/tutor/infrastructure/byok_queries.py` rather than `queries.py`: the TypeScript ranges these
tables in `packages/services/src/ai/*`, not in `tutor-chat`, and the statements stay grouped with the
service that owns them. Columns in the same order, same `order by created_at asc`, same
`for update limit 1`, same `pg_advisory_xact_lock(hashtext(...))`, same `on conflict (user_id, task)`.

## TypeScript tests ported (`evidence/SPEC-2001/test-port-map.md`)

| TypeScript test | Python twin | Status |
|---|---|---|
| `packages/services/src/tutor-chat/context.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/context.build.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/sources.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/follow-ups.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/starters.test.ts` | `tests/unit/tutor/test_tutor_starters.py` (SPEC-2203 port) | done |
| `packages/services/src/tutor-chat/conversations.test.ts` | `tests/integration/tutor/test_tutor_conversations.py` | done |
| `packages/services/src/tutor-chat/stream.test.ts` | `tests/integration/tutor/test_tutor_stream.py` + `test_tutor_stream_facade.py` | done |
| `packages/services/src/tutor-chat/self-test.test.ts` | `tests/integration/tutor/test_tutor_self_test.py` | done |
| `packages/services/src/ai/credentials-service.test.ts` | `tests/integration/tutor/test_tutor_byok.py` | done (masking, ownership 404, delete, local switch) |
| `packages/services/src/ai/qualify-model.test.ts` | `tests/integration/tutor/test_tutor_byok.py` | done (connection, compatibility, foreign key, wrong model) |
| `apps/api/test/integration/ai-credentials-routes.test.ts` | `tests/integration/tutor/test_tutor_byok.py` | done (service level; the route wrapper is pinned by `test_handlers.py` and the pipeline tests of SPEC-2201) |
| `apps/api/test/integration/ai-qualify-route.test.ts` | `tests/integration/tutor/test_tutor_byok.py` | done (service level) |
| `apps/api/test/integration/spec-709-routes.test.ts` | `tests/integration/tutor/test_tutor_byok.py` | done (state, assign, clear, foreign key) |
| `packages/tutor/src/loop.test.ts` | — | pending (agent loop not ported, SPEC-2205/2207) |
| `apps/web/e2e/specs/p6/spec-602-onboarding.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending (page and e2e) |
| `apps/web/e2e/specs/p7/spec-709.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending (page and e2e) |

Cases of `credentials-service.test.ts` and `qualify-model.test.ts` that stay in TypeScript for now,
with their reason:

| Case | Reason |
|---|---|
| `markCredentialStatus` (statut inconnu, clé absente, empreinte conservée) | used by SPEC-506 after a qualification and on `AI_KEY_INVALID`; no route of this slice calls it, it travels with the job slice (ADR-2028) |
| `qualificationBrickBattery` + `stopAfterInvalidBrick` | demonstration path of the SDD page and job slice; not reachable from `me.ai.credentials.qualify` (ADR-2028) |
| `assignTaskModel` | already ported by SPEC-2201 (`learny.identity.application.ai_models`) |

## Parity

`api/oracles/recordings/reads.json` now holds a `tutor` group with the two generable reads
(`me.ai.credentials.list`, `me.ai.models.get`) recorded against Hono and replayed against the Python
facade: **2 scenarios, 0 divergence**. The five mutations and the SSE conversation chain are not
generable; their proof is the 26 integration cases and the oracle vectors (see `parity.md`).

## AI building blocks reused (no duplication)

`learny.platform.llm` (gateway, task table, provider catalogue, discovery, qualification battery,
BYOK envelope, fixtures `packages/llm/fixtures/*`), `learny.tutor.domain.*` (context, prompt,
sources, follow-ups, events, turn, starters, `ai_credentials`, `ai_models`),
`learny.assessments.domain.bricks.validate` (the `open_question` brick of Teste-moi),
`learny.learning.public.apply_learning_result` (mastery, FSRS and gap writes),
`learny.platform.safe_fetch.resolve_public_url` (the public-URL guard of the endpoints).
