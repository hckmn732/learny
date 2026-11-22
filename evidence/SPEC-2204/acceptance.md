# SPEC-2204 — acceptance

Branch `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`, base `65ebfec1`.
Status: **in progress** (partial delivery). Each criterion states what is proven and what remains.

- **CA-1 — all 12 operations `py`** — ⏳ 0/12 flipped. `api/ownership.yaml` untouched: the runtime
  use cases, the queries and the handlers are not written yet, so a flip would serve 500s.
  Ported so far: the pure domain of the context, the prompt, the citations and the SSE sequence.
- **CA-2 — parity, zero divergence** — ⏳ `parity:record/--check --group tutor` not run yet; the
  oracle vectors (`api/oracles/vectors/tutor.json`, 50 cases) are byte-identical between the two
  runtimes, which is the prerequisite.
- **CA-3 — every TS test has a pytest twin** — ⏳ 5 of 16 rows of `scope.md` are done (domain
  vectors: context assembly, greeting, prompt, sources, follow-ups, turns); the rest is listed.
- **CA-4 — import-linter contracts pass** — ✅ `uv run lint-imports` → 1 kept, 0 broken; the tutor
  domain imports nothing but `learny.shared.*` and `learny.tutor.domain.*`.
- **CA-5 — e2e through the facade** — ⏳ no e2e spec yet (`apps/web/e2e/specs/p22/spec-2204.spec.ts`
  and the `/_dev/sdd/SPEC-2204` page are pending); the operations are still served by Hono.

## Proven in this slice

| Proof | Command | Result |
|---|---|---|
| Domain equals the TypeScript oracle (strict) | `uv run pytest packages-py/learny/tests/unit/tutor -q` | 50 passed |
| Prompt built from the real Markdown sources | same | 2 prompt cases byte-identical |
| SSE sequence and `data:` framing | same | 4 chat cases + self-test + error, exact bytes |
| Lint / types | `uv run ruff check packages-py apps`, `uv run mypy packages-py/learny/src/learny/tutor`, `uv run lint-imports` | green |
| French strings isolated | `uv run pytest packages-py/learny/tests/unit/shared -q` | 112 passed |

## Next step (resume)

1. `learny/tutor/infrastructure/queries.py` (SQL of `conversations.ts` + `context.ts`).
2. `learny/tutor/application/{conversations,stream,self_test}.py` with the two short transactions.
3. `apps/api-py/src/learny_api/sse.py` + `handlers/tutor.py`, then flip the 5 conversation routes.
4. `tests/integration/tutor/*`, `parity:record --group tutor`, e2e + `/_dev/sdd/SPEC-2204`.
5. `node tools/sdd/validate.mjs SPEC-2204` then `complete.mjs --no-merge --no-push`.
