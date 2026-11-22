# Périmètre — SPEC-2203 (domaine Content & Retrieval et ingestion en Python)

Source unique : `api/inventory.json`, filtré sur `context == "content"`. L'inventaire fait foi
(ADR-2005, ADR-1001) : il contient **18 opérations** de contexte `content` et **aucune route
spéciale**. Le plan P22 et le titre de la spécification annoncent « 19 opérations » : l'écart d'une
unité vient du décompte du plan, arrêté avant la génération de l'inventaire ; les 18 entrées
ci-dessous sont la liste exacte des entrées à basculer (constat consigné dans l'`acceptance.md`).

## État de la bascule

| Contexte | Opérations | `py` | `ts` restantes |
|---|---|---|---|
| content | 18 | **18** | 0 |

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Propriétaire | Implémentation TS |
|---|---|---|---|---|---|
| [x] | `chapters.complete` | POST | `/api/v1/chapters/:cid/complete` | py | `resources.ts` (`complete-chapter.ts`) |
| [x] | `chapters.summary` | POST | `/api/v1/chapters/:cid/summary` | py | `course-reading.ts` (`summary.ts`) |
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
| `chapters.summary` | `summary.submit_chapter_summary` | chapter_summaries, courses, course_sections, event_outbox | `test_content_summary.py` |
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

## Ingestion et plateforme (étape 3)

| Module TypeScript | Landing Python | Preuve |
|---|---|---|
| `packages/core/src/net/ip-ranges.ts` | `learny/platform/safe_fetch.py` | `tests/unit/platform/test_platform_safe_fetch.py` |
| `packages/core/src/net/assert-public-url.ts` | `learny/platform/safe_fetch.py` | `tests/unit/platform/test_platform_safe_fetch.py` |
| `packages/core/src/net/safe-fetch.ts` | `learny/platform/safe_fetch.py` | `tests/unit/platform/test_platform_safe_fetch.py` |
| `packages/ingestion/src/extract/{note,pdf,web,youtube,image}.ts` | `learny/content/infrastructure/extract/` | `tests/unit/content/test_content_extract.py` |
| `packages/ingestion/src/extract/remote.ts` | `learny/content/infrastructure/extract/remote.py` | `tests/unit/content/test_content_extract.py` |
| `packages/ingestion/src/process-resource.ts` | `learny/content/application/ingestion.py` | `tests/integration/content/test_content_ingestion.py` |
| `packages/ingestion/src/deps.ts` (`readPdf`) | `learny/content/infrastructure/files.py` | couvert par `test_content_ingestion.py` (lecteur injecté) |
| `packages/ingestion/src/embeddings.ts` (Voyage) | `learny/platform/embeddings.py` | `tests/unit/platform/test_platform_embeddings.py` |
| `packages/llm/src/search/*` | `learny/platform/search.py` | `tests/unit/platform/test_platform_search.py` |
| `packages/services/src/courses/summary.ts` | `learny/content/application/summary.py` | `tests/integration/content/test_content_summary.py` |

Aucune route spéciale n'est concernée. Le worker (`apps/worker-py`) branchera `process_resource`
en SPEC-2207 ; le cas d'usage est dès maintenant appelable et testé.

## Reste à faire (reprise)

1. Page de démonstration `/_dev/sdd/SPEC-2203` et tests e2e `@SPEC-2203 @visual` : hors de cette
   tranche, le contexte est basculé mais la page n'est pas encore livrée.
2. `acceptance.md` à finaliser (CA-1 et CA-3 peuvent passer ✅ ; CA-2 reste une campagne non
   exécutée, CA-5 attend la page et l'e2e).
3. `validate.mjs` puis `complete.mjs` (jamais lancés dans cette tranche ; CP-21 reste `pending`).
4. Cas d'usage de lecture encore non couverts par un test d'intégration (`course-citations.source`,
   `course-sections.*`, `courses.progress`, `modules.course`) : comportements déjà portés et verts,
   seuls les tests listés « à porter » de `test-port-map.md` manquent.
5. Upload PDF vers l'API Files d'Anthropic : le port `UploadPdf` existe mais le défaut renvoie
   `None` tant que la résolution BYOK n'est pas branchée (SPEC-2204) ; l'extraction texte reste
   complète, aucune donnée n'est perdue.
