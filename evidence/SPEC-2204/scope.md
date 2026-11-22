# SPEC-2204 — scope: the `tutor` context (12 operations)

Filtered from `api/inventory.json` (`generatedFrom` 65ebfec1) and `api/ownership.yaml`.

## Operations served by Python in this slice (5)

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

`api/ownership.yaml` flipped these five entries from `ts` to `py` in the same commit as
`apps/api-py/src/learny_api/handlers/tutor.py` (`test_handlers.py` stays green).

## Operations still TypeScript (another slice)

- [ ] `me.ai.credentials.create` / `.delete` / `.discover` / `.list` / `.qualify`
- [ ] `me.ai.models.get` / `.update`

These are the BYOK credentials and model-selection operations: out of scope here, untouched.

## Tables read or written

`tutor_conversations`, `tutor_messages`, `courses`, `chapters`, `formations`, `modules`,
`profiles`, `reading_progress`, `resources`, `resource_chunks`, `notions`, `notion_states`,
`course_sections` (reads), and for Teste-moi `bricks`, `brick_versions`, `activities`, `attempts`,
`answers`, `schedule_slots` (writes through `apply_learning_result` and the answer rows).

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
| `packages/tutor/src/loop.test.ts` | `tests/unit/tutor/test_tutor_loop.py` | pending (loop not ported) |
| `packages/services/src/ai/credentials-service.test.ts` | `tests/integration/tutor/test_tutor_ai_credentials.py` | pending (other slice) |
| `packages/services/src/ai/qualify-model.test.ts` | `tests/integration/tutor/test_tutor_ai_qualify.py` | pending (other slice) |
| `apps/api/test/integration/ai-credentials-routes.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_credentials_routes.py` | pending (other slice) |
| `apps/api/test/integration/ai-qualify-route.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_qualify_route.py` | pending (other slice) |
| `apps/api/test/integration/spec-709-routes.test.ts` | `apps/api-py/tests/integration/test_tutor_ai_models_routes.py` | pending (other slice) |
| `apps/web/e2e/specs/p6/spec-602-onboarding.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending (page and e2e) |
| `apps/web/e2e/specs/p7/spec-709.spec.ts` | `apps/web/e2e/specs/p22/spec-2204.spec.ts` | pending (page and e2e) |

## Parity

`tools/parity/run.ts` now compares an SSE answer as the ordered list of its parsed `data:` payloads
(§11 of the conventions) and a unit test pins the parser. Recording a `tutor` group needs a ready
course and a conversation, which the harness cannot seed (see `parity.md`); the parity proof of this
slice rests on the oracle vectors and the facade integration.

## AI building blocks reused (no duplication)

`learny.platform.llm` (gateway, task table, fixtures `packages/llm/fixtures/tutor/*.json`),
`learny.tutor.domain.*` (context, prompt, sources, follow-ups, events, turn, starters),
`learny.assessments.domain.bricks.validate` (the `open_question` brick of Teste-moi),
`learny.learning.public.apply_learning_result` (mastery, FSRS and gap writes).

