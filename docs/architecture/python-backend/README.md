# Python backend — technical canvas

This folder is the **technical canvas** for the `python-migration` track (SPEC-2001 → SPEC-2302). It turns the ADRs into concrete, step-by-step instructions so that the agent executing a spec only has to follow it. It is **normative for implementation** (ADR-2011): when a spec says *what*, this folder says *how*. Priority stays ADR > business rules > spec > this canvas > other documents.

Written in English on purpose: the Python backend is English-only (ADR-2011).

## Reading order for an executing agent

1. [00-conventions.md](00-conventions.md) — layout, layers, patterns, libraries, rules that apply to every spec. Read it fully once.
2. The plan of the phase you are working on:
   - [P20-plan.md](P20-plan.md) — SPEC-2001 inventory & oracles, SPEC-2002 contract, SPEC-2003 Python foundation & facade.
   - [P21-plan.md](P21-plan.md) — SPEC-2101 database, identity, RLS, storage; SPEC-2102 outbox & worker.
   - [P22-plan.md](P22-plan.md) — SPEC-2201 → SPEC-2206 business contexts, SPEC-2207 jobs & crons cutover.
   - [P23-plan.md](P23-plan.md) — SPEC-2301 Coolify deployment & progressive cutover, SPEC-2302 full regression & TypeScript removal.
3. [spikes.md](spikes.md) — what was validated on a real machine before writing this canvas (versions, results). Reuse those snippets.

## Decisions at a glance

| Topic | Decision | Source |
|---|---|---|
| Runtime | Python 3.13, uv workspace, FastAPI + Uvicorn, Pydantic v2 | ADR-2002 |
| Shape | Modular monolith, one library `learny` with 9 business contexts + `views` + `platform` + `shared` | ADR-2003, ADR-2011 |
| HTTP | Contract-driven route table generated from `api/openapi.yaml`, one generic pipeline, thin handlers; FastAPI is only the ASGI host/router | ADR-2012 |
| Models | Pydantic models **generated** from the contract; they are the DTOs (no parallel DTO layer) | ADR-2012 |
| Persistence | SQLAlchemy 2 Core async + psycopg 3, SQL written explicitly (`text()`), no ORM mapping, same schema and migrations | ADR-2013 |
| Identity/RLS | Local JWT verification, transaction-local claims + `set local role authenticated`, closed list of privileged use cases | ADR-2010 |
| Async jobs | Home-made worker: `event_outbox` → `job_deliveries` fan-out, leases with `FOR UPDATE SKIP LOCKED`, all consumers flipped together in SPEC-2207 | ADR-2006, ADR-2014 |
| Coexistence | Python facade in front of Hono, `api/ownership.yaml` gives one owner per operation/consumer | ADR-2005 |
| Libraries | Fixed list, no frameworks on top (no LangChain, no LiteLLM, no DI container, no ORM) | ADR-2015 |
| Language | Code, comments, logs, tests, docstrings in English; user-facing French strings isolated in `locale_fr` modules and templates, byte-identical to today | ADR-2011 |
| Hosting | Coolify (API + worker), web unchanged | ADR-2007 |
| Proof env | Staging provided by the project owner for load/canary/rollback/restore | ADR-2009 |

## Golden rules (memorise these)

1. **Parity first.** The TypeScript behaviour on `main` is the oracle. If this canvas and the TS code disagree on an observable behaviour, the TS behaviour wins and you record an ADR (`node tools/sdd/adr.mjs new …`).
2. **Port, don't redesign.** Translate the behaviour and the SQL, not the TypeScript file structure. No new features, no "improvements" visible to users.
3. **Boring code.** Functions over classes, explicit parameters over magic, one way to do each thing. The anti-patterns list in 00-conventions §4 is binding.
4. **Never edit an oracle.** E2E, visual, accessibility and HTTP-contract tests are frozen (ADR-2008). Fix the Python, never the test.
5. **English everywhere in code; French only where a user reads it**, and then copied verbatim from TS.

## Glossary (French domain term → English identifier)

Use these names for Python identifiers. Database tables/columns, JSON fields, routes, event names, error codes and stored enum values **keep their existing (sometimes French) spelling** — they are part of the contract.

| Domain term (FR) | Python identifier | Note |
|---|---|---|
| formation | `formation` | kept (valid English, matches table `formations`) |
| cadrage | `scoping` | table `cadrage_messages` unchanged |
| programme | `programme` | |
| notion | `notion` | |
| chapitre / module | `chapter` / `module_` (avoid shadowing) or `course_module` | |
| apport | `contribution` | |
| ressource | `resource` | |
| cours | `course` | |
| brique | `brick` | |
| quiz, tentative, réponse | `quiz`, `attempt`, `answer` | |
| examen blanc | `mock_exam` | |
| exercice | `exercise` | |
| révision | `review` | |
| lacune | `gap` | |
| maîtrise | `mastery` | |
| échauffement | `warmup` | |
| agenda / créneau | `agenda` / `slot` | |
| série, jalon | `streak`, `milestone` | |
| automatisme | `automation` | stored keys (`reprise`, `micro_seance`, …) stay as values: `class AutomationKey(StrEnum): RESUME = "reprise"` |
| tuteur | `tutor` | |
| clé IA personnelle | `ai_credential` | |
| export / suppression des données | `data_export` / `account_deletion` | |
| formation à plusieurs | `group` | tables `groups`, `group_members` |
