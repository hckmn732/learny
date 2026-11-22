# Périmètre — SPEC-2203 (domaine Content & Retrieval et ingestion en Python)

Source unique : `api/inventory.json`, filtré sur `context == "content"`. L'inventaire fait foi
(ADR-2005, ADR-1001) : il contient **18 opérations** de contexte `content` et **aucune route
spéciale**. Le plan P22 et le titre de la spécification annoncent « 19 opérations » : l'écart d'une
unité vient du décompte du plan, arrêté avant la génération de l'inventaire ; les 18 entrées
ci-dessous sont la liste exacte des entrées à basculer (constat consigné dans l'`acceptance.md`).

## État de la bascule

| Contexte | Opérations | `py` | `ts` restantes |
|---|---|---|---|
| content | 18 | **17** | 1 (`chapters.summary`) |

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Propriétaire | Implémentation TS |
|---|---|---|---|---|---|
| [x] | `chapters.complete` | POST | `/api/v1/chapters/:cid/complete` | py | `resources.ts` (`complete-chapter.ts`) |
| [ ] | `chapters.summary` | POST | `/api/v1/chapters/:cid/summary` | ts | `course-reading.ts` (`summary.ts`) |
| [x] | `course-citations.source` | GET | `/api/v1/course-citations/:cid/source` | py | `course-reading.ts` (`citation-source.ts`) |
| [x] | `course-sections.edit` | PATCH | `/api/v1/course-sections/:sid` | py | `course-reading.ts` (`edit-section.ts`) |
| [x] | `course-sections.report` | POST | `/api/v1/course-sections/:sid/report` | py | `course-reading.ts` (`report-section.ts`) |
| [x] | `courses.progress` | PUT | `/api/v1/courses/:cid/progress` | py | `course-reading.ts` (`progress.ts`) |
| [x] | `modules.course` | GET | `/api/v1/modules/:mid/course` | py | `course.ts` (`get-course.ts`) |
| [x] | `modules.generateCourse` | POST | `/api/v1/modules/:mid/course-generation` | py | `resources.ts` (`generate.ts`) |
| [x] | `modules.screen` | GET | `/api/v1/modules/:mid` | py | `resources.ts` (`module.ts`) |
| [x] | `resources.create` | POST | `/api/v1/chapters/:cid/resources` | py | `uploads.ts` (`create-resource.ts`) |
| [x] | `resources.delete` | DELETE | `/api/v1/resources/:rid` | py | `uploads.ts` (`delete.ts`) |
| [x] | `resources.finalize` | POST | `/api/v1/resources/:rid/finalize` | py | `uploads.ts` (`finalize.ts`) |
| [x] | `resources.readUrl` | GET | `/api/v1/resources/:rid/url` | py | `uploads.ts` (`read.ts`) |
| [x] | `resources.rename` | PATCH | `/api/v1/resources/:rid` | py | `resources.ts` (`rename.ts`) |
| [x] | `resources.retry` | POST | `/api/v1/resources/:rid/retry` | py | `resources.ts` (`retry.ts`) |
| [x] | `suggestions.dismiss` | POST | `/api/v1/resources/:rid/dismiss` | py | `resources.ts` (`suggestions.ts`) |
| [x] | `suggestions.import` | POST | `/api/v1/resources/:rid/import` | py | `resources.ts` (`suggestions.ts`) |
| [x] | `uploads.create` | POST | `/api/v1/chapters/:cid/uploads` | py | `uploads.ts` (`create-upload.ts`) |

## Matrice entrée → cas d'usage → tables → tests

| Opération | Cas d'usage (`learny/content/application/`) | Tables | Tests |
|---|---|---|---|
| `chapters.complete` | `chapters.complete_chapter` | chapters, chapter_progress, modules, module_progress, resources, event_outbox | `test_content_resources.py` |
| `course-citations.source` | `citations.get_citation_source` | citations, resources | à porter |
| `course-sections.edit` | `sections.edit_course_section` | course_sections, courses, course_section_reports, bricks, event_outbox | à porter |
| `course-sections.report` | `sections.report_course_section` | course_sections, courses, course_section_reports, bricks, event_outbox | à porter |
| `courses.progress` | `progress.record_course_progress` | courses, chapters, course_sections, reading_progress, event_outbox | à porter |
| `modules.course` | `course.get_module_course` | modules, formations, chapters, courses, course_sections, citations, chapter_summaries, notions, notion_states, reading_progress | à porter |
| `modules.generateCourse` | `generate.generate_course_now` | modules, module_progress, chapters, chapter_progress, resources, event_outbox | `test_content_resources.py` |
| `modules.screen` | `module_screen.get_module_screen` | modules, formations, module_progress, chapters, chapter_progress, resources | `test_content_resources.py` |
| `resources.create` | `resources.create_resource` | resources, chapters, event_outbox | `test_content_resources.py` |
| `resources.delete` | `resources.delete_resource` | resources, citations | `test_content_resources.py` |
| `resources.finalize` | `resources.finalize_upload` | resources, event_outbox | `test_content_resources.py` |
| `resources.readUrl` | `resources.get_signed_read_url` | resources | `test_content_resources.py` |
| `resources.rename` | `resources.rename_resource` | resources | `test_content_resources.py` |
| `resources.retry` | `resources.retry_resource` | resources, event_outbox | `test_content_resources.py` |
| `suggestions.dismiss` | `suggestions.dismiss_suggestion` | resources | `test_content_resources.py` |
| `suggestions.import` | `suggestions.import_suggestion` | resources, chapters, event_outbox | `test_content_resources.py` |
| `uploads.create` | `resources.create_upload` | resources, chapters | `test_content_resources.py` |

## Domaine pur porté (étape 2)

| Module TypeScript | Landing Python | Preuve |
|---|---|---|
| `packages/ingestion/src/chunk.ts` | `learny/content/domain/chunk.py` | `tests/unit/content/test_content_chunk.py` |
| `packages/ingestion/src/retrieval/select-context.ts` | `learny/content/domain/retrieval.py` | `tests/unit/content/test_content_retrieval.py` |
| `packages/ingestion/src/retrieval/format-document.ts` | `learny/content/domain/retrieval.py` | `tests/unit/content/test_content_retrieval.py` |
| `packages/ingestion/src/embeddings.ts` (mock + validation) | `learny/content/domain/embeddings.py` | `tests/unit/content/test_content_embeddings.py` |
| `packages/services/src/resources/limits.ts` | `learny/content/domain/limits.py` | couvert par les tests d'intégration des contributions |
| `packages/services/src/tutor-chat/starters.ts` | `learny/tutor/domain/starters.py` | premier usage (règle du plan P22), consommé par `modules.course` |

## Reste à faire (reprise)

1. `chapters.summary` : porter `packages/services/src/courses/summary.ts` (tâche LLM `summary`,
   `chapter_summaries`, correction différée) puis basculer l'entrée.
2. Ingestion (`learny/platform/safe_fetch.py`, extracteurs PDF/DOCX/MD/TXT/web/YouTube/image,
   `process_resource` avec reprise par étapes) : cas d'usage du job `ingest-resource`, branché au
   worker en SPEC-2207 (EF-1, CA-1).
3. `learny/platform/embeddings.py` (Voyage) et `learny/platform/search.py` (`SEARCH_API_KEY`).
4. Tests d'intégration `tests/integration/content/*` listés dans la matrice ci-dessus.
5. Parité (`parity:record|check --group content`), e2e `@SPEC-2203` et test `@visual` de la page
   `/_dev/sdd/SPEC-2203`, puis `validate.mjs` et `complete.mjs`.
