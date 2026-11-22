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
| `packages/ingestion/src/retrieval/search-context.test.ts` | recherche sémantique sous RLS | — | à porter (hors de cette tranche : aucun cas d'usage de lecture ne l'appelle encore) |
| `packages/core/src/net/{ip-ranges,assert-public-url,safe-fetch,safe-fetch-edges}.test.ts` | garde SSRF, classification, robots.txt, redirections, cache, bornes | `tests/unit/platform/test_platform_safe_fetch.py` | porté (transport et DNS injectés, aucun socket) |
| `packages/ingestion/test/integration/ssrf.test.ts` | refus avant connexion, rebinding DNS, taille et délai | `tests/unit/platform/test_platform_safe_fetch.py` | porté |
| `packages/ingestion/src/extract/remote.test.ts` | web, YouTube, image (CA-1 à CA-4) | `tests/unit/content/test_content_extract.py` | porté |
| `packages/ingestion/src/process-resource.test.ts` | étages, reprise, événements, échec permanent | `tests/integration/content/test_content_ingestion.py` | porté |
| `packages/ingestion/test/integration/resource.test.ts` | ingestion de bout en bout (note, PDF) | `tests/integration/content/test_content_ingestion.py` | porté (note et web ; PDF couvert par l'extracteur unitaire) |

## Adaptateurs de plateforme

| Test TypeScript source | Cas | Python | État |
|---|---|---|---|
| `packages/ingestion/src/embeddings.ts` (client Voyage) | clé absente, 401/403, 429/5xx, réponse invalide, paramètres | `tests/unit/platform/test_platform_embeddings.py` | porté |
| `packages/llm/src/search/search.test.ts` | HTML actif, URLs publiques, doublons canoniques, budget, Tavily | `tests/unit/platform/test_platform_search.py` | porté |
| `packages/llm/src/search/fixtures.ts` | `native`, `empty`, `fallback`, `unsafe`, `unavailable` | `test_platform_search.py` (fixtures `packages/llm/fixtures/search/`) | porté |

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
| `courses/summary.test.ts` | 5 | `tests/integration/content/test_content_summary.py` | porté (validation, commit, correction, rejeu, brouillon différé) |
| `courses/validate-citations.test.ts` | 4 | — | à porter |
| `courses/section-bricks.test.ts` | 3 | — | à porter |

## Fixtures

- `packages-py/learny/tests/fixtures/content_domain.json` est produit par
  `corepack pnpm exec tsx tools/content/oracle.mjs` sur les implémentations TypeScript ; il est
  committé et rejoué par les trois modules unitaires du domaine.
- `packages-py/learny/tests/fixtures/content_web.json` reprend mot pour mot `WEB_FIXTURE_HTML` et
  ses métadonnées (`packages/ingestion/fixtures/web.ts`) ; les tests extraient le même titre, le
  même texte principal et les mêmes ancrages.
- `packages/llm/fixtures/youtube/captions.json` reprend `YOUTUBE_FIXTURES`
  (`packages/ingestion/fixtures/youtube.ts`) ; le provider mock le lit, aucun test n'appelle
  YouTube.
- Les PDF des tests sont construits en mémoire par le même assembleur que
  `packages/ingestion/fixtures/pdf.ts` (aucun binaire committé).
- Les fixtures de recherche sont celles déjà committées sous `packages/llm/fixtures/search/`.

## Totaux

- Avant cette tranche : 1 535 tests verts.
- Après cette tranche : **1 631 tests verts** (+96), dont :
  - `test_platform_safe_fetch.py` : 34 cas ;
  - `test_platform_embeddings.py` : 14 cas ;
  - `test_platform_search.py` : 20 cas ;
  - `test_content_extract.py` : 18 cas ;
  - `test_content_ingestion.py` : 5 cas d'intégration ;
  - `test_content_summary.py` : 5 cas d'intégration.
