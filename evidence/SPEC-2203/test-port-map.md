# Carte de portage des tests — SPEC-2203

Convention (ADR-2008) : mêmes cas, mêmes valeurs attendues ; le nom Python garde le titre TypeScript
traduit en anglais. Les fichiers marqués « porté » sont verts ; les autres restent à porter.

## Domaine (`packages/ingestion`)

| Test TypeScript source | Cas | Python | État |
|---|---|---|---|
| `packages/ingestion/src/chunk.ts` (couvert par `process-resource.test.ts`) | 8 vecteurs | `tests/unit/content/test_content_chunk.py` | porté |
| `packages/ingestion/src/retrieval/select-context.test.ts` | normalisation, recouvrement, ordre, déduplication, budget | `tests/unit/content/test_content_retrieval.py` | porté (vecteurs `tools/content/oracle.mjs`) |
| `packages/ingestion/src/retrieval/format-document.ts` | échappement et attributs | `tests/unit/content/test_content_retrieval.py` | porté |
| `packages/ingestion/src/embeddings.ts` | vecteur déterministe, littéral, lots, dimensions | `tests/unit/content/test_content_embeddings.py` | porté |
| `packages/ingestion/src/retrieval/search-context.test.ts` | recherche sémantique sous RLS | — | à porter (requête non portée) |
| `packages/ingestion/test/integration/{ssrf,remote}.test.ts` | garde SSRF, robots.txt, bornes | — | à porter (`safe_fetch` non porté) |
| `packages/ingestion/test/integration/{resource,search-context}.test.ts` | ingestion de bout en bout | — | à porter (`process_resource` non porté) |

## Services (`packages/services/src/resources`, `courses`)

| Test TypeScript source | Cas | Python | État |
|---|---|---|---|
| `resources/create.test.ts` | 6 | `tests/integration/content/test_content_resources.py` | porté (note créée, note trop longue) |
| `resources/limits.test.ts` | bornes BR-APP-02 | — | couvert par `test_content_resources.py` (note) et le domaine `limits.py` |
| `resources/upload.test.ts` | 12 | — | à porter (envoi signé, rejeu d'idempotence, quotas) |
| `resources/lifecycle.test.ts` | 14 | `tests/integration/content/test_content_resources.py` | partiel (rejeu, écran de module, complétion) |
| `resources/module-actions.test.ts` | 3 | `tests/integration/content/test_content_resources.py` | partiel (complétion) |
| `courses/get-course.test.ts` | 3 | — | à porter |
| `courses/get-course-detail.test.ts` | 6 | — | à porter |
| `courses/progress.test.ts` | 3 | — | à porter (fonctions pures portées dans `progress.py`) |
| `courses/progress.service.test.ts` | 4 | — | à porter |
| `courses/edit-section.test.ts` | 5 | — | à porter |
| `courses/report-section.test.ts` | 4 | — | à porter |
| `courses/citation-source.test.ts` | 5 | — | à porter |
| `courses/summary.test.ts` | 5 | — | à porter (`chapters.summary` non porté) |
| `courses/validate-citations.test.ts` | 4 | — | à porter |
| `courses/section-bricks.test.ts` | 3 | — | à porter |

## Fixtures

`packages-py/learny/tests/fixtures/content_domain.json` est produit par
`corepack pnpm exec tsx tools/content/oracle.mjs` sur les implémentations TypeScript ; il est
committé et rejoué par les trois modules unitaires ci-dessus.
