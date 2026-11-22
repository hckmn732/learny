# SPEC-2204 — scope: the `tutor` context (12 operations)

Filtered from `api/inventory.json` (`generatedFrom` 65ebfec1) and `api/ownership.yaml`.

## Operations (all `ts` at the start of the spec)

- [ ] `conversations.get` — GET `/api/v1/conversations/:id` → `tutor-chat.ts` `conversationGet`
- [ ] `conversations.messages` — POST `/api/v1/conversations/:id/messages` (SSE) → `streamReply`
- [ ] `conversations.self-test.answer` — POST `/api/v1/conversations/:id/self-test/answer` → `answerSelfTest`
- [ ] `courses.conversations.create` — POST `/api/v1/courses/:cid/conversations` → `createConversation`
- [ ] `courses.conversations.list` — GET `/api/v1/courses/:cid/conversations` → `listConversations`
- [ ] `me.ai.credentials.create` — POST `/api/v1/me/ai/credentials` → `createCredential`
- [ ] `me.ai.credentials.delete` — DELETE `/api/v1/me/ai/credentials/:id` → `deleteCredential`
- [ ] `me.ai.credentials.discover` — POST `/api/v1/me/ai/credentials/discover` → `discoverCredentialModels`
- [ ] `me.ai.credentials.list` — GET `/api/v1/me/ai/credentials` → `listCredentials`
- [ ] `me.ai.credentials.qualify` — POST `/api/v1/me/ai/credentials/:id/qualify` → `qualifyCredential`
- [ ] `me.ai.models.get` — GET `/api/v1/me/ai/models` → `getAiModelsState`
- [ ] `me.ai.models.update` — PATCH `/api/v1/me/ai/models` → `updateAiModels`

No special route and no event is owned by the context: `conversations.messages` is a normal
`py`-capable route whose handler answers a `text/event-stream` body. The `tutor` task of the AI
table (low effort, 8k output, 60 s) is the only task used.

## Tables read or written

`tutor_conversations`, `tutor_messages`, `citations`, `courses`, `course_sections`, `resources`,
`resource_chunks`, `chapters`, `modules`, `formations`, `notions`, `notion_states`, `profiles`,
`reading_progress`, `attempts`, `brick_versions`, `schedule_slots`.

## TypeScript tests to port (`evidence/SPEC-2001/test-port-map.md`)

| TypeScript test | Python twin | Status |
|---|---|---|
| `packages/services/src/tutor-chat/context.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/context.build.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/sources.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/follow-ups.test.ts` | `tests/unit/tutor/test_tutor_domain_vectors.py` | done |
| `packages/services/src/tutor-chat/starters.test.ts` | `tests/unit/tutor/test_tutor_starters.py` (SPEC-2203 port) | done |
| `packages/services/src/tutor-chat/conversations.test.ts` | `tests/integration/tutor/test_tutor_conversations.py` | pending |
| `packages/services/src/tutor-chat/stream.test.ts` | `tests/unit/tutor/test_tutor_stream_events.py` | pending |
| `packages/services/src/tutor-chat/self-test.test.ts` | `tests/integration/tutor/test_tutor_self_test.py` | pending |
| `packages/tutor/src/loop.test.ts` | `tests/unit/tutor/test_tutor_loop.py` | pending |
| `packages/services/src/ai/credentials-service.test.ts` | `tests/integration/tutor/test_tutor_ai_credentials.py` | pending |
| `packages/services/src/ai/qualify-model.test.ts` | `tests/integration/tutor/test_tutor_ai_qualify.py` | pending |
| `apps/api/test/integration/ai-credentials-routes.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_credentials_routes.py` | pending |
| `apps/api/test/integration/ai-qualify-route.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_qualify_route.py` | pending |
| `apps/api/test/integration/spec-709-routes.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_models_routes.py` | pending |
| `apps/web/e2e/specs/p6/spec-602-onboarding.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending |
| `apps/web/e2e/specs/p7/spec-709.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending |

## Parity

`corepack pnpm parity:check --group tutor` — the generated scenarios cover the two `GET` without
path parameter (`me.ai.credentials.list`, `me.ai.models.get`); the conversation and SSE chains need
hand-written mutations (ordered `data:` comparison added to `tools/parity/run.ts`).

## AI building blocks reused (no duplication)

`learny.platform.llm` (gateway, task table, fixtures `packages/llm/fixtures/tutor/*.json`),
`learny.tutor.domain.starters` (SPEC-2203 port), `learny.content.domain.retrieval` escaping rules
(re-implemented as three lines in the tutor domain to keep the import-linter contracts).
