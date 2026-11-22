# Carte de portage des tests — SPEC-2203

Convention (ADR-2008) : mêmes cas, mêmes valeurs attendues ; le nom Python garde le titre TypeScript
traduit en anglais. Les fichiers marqués « porté » sont verts ; les autres restent à porter.

## Domaine (`packages/ingestion`, `packages/tutor`)

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
| `packages/services/src/courses/validate-citations.test.ts` (résolveur pur dans `packages/tutor/src/course/citations.ts`) | 7 | `tests/unit/content/test_content_validate_citations.py` | porté (8 cas : le résumé d'échec est couvert en plus) |
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
| `resources/limits.test.ts` | bornes BR-APP-02 | `tests/unit/content/test_content_upload_limits.py` | porté (vecteurs des cinq bornes) |
| `resources/upload.test.ts` | 22 blocs (23 cas) | `tests/unit/content/test_content_upload_limits.py` (23 cas) et `tests/integration/content/test_content_uploads.py` (8 cas) | porté sauf la page de démonstration `simulateUpload` (route dev, SPEC-2207) et le remplissage du PDF à 50 Mo exact (la borne d'octets est exercée sur la constante, la borne de pages sur de vrais octets) |
| `resources/lifecycle.test.ts` | 14 | `tests/integration/content/test_content_resources.py` | partiel (rejeu, écran de module, complétion) |
| `resources/module-actions.test.ts` | 3 | `tests/integration/content/test_content_resources.py` | partiel (complétion) |
| `courses/get-course.test.ts` | 4 | `tests/integration/content/test_content_course.py` | porté (module étranger, sans chapitre, sans génération, cours prêt minimal) |
| `courses/get-course-detail.test.ts` | 4 | `tests/integration/content/test_content_course.py` | porté en 5 cas : l'état « citation sur un chunk avec `resourceCount = 0` » est impossible en base (un chunk implique une ressource prête), donc le cours complet et les suggestions en attente sont deux scénarios |
| `courses/progress.test.ts` | 4 | `tests/unit/content/test_content_progress_rules.py` | porté |
| `courses/progress.service.test.ts` | 9 | `tests/integration/content/test_content_progress.py` | porté en 8 cas : l'appel non authentifié est tenu par la façade (`requireUser`), couvert par les tests du pipeline |
| `courses/edit-section.test.ts` | 11 | `tests/integration/content/test_content_sections.py` | porté en 10 cas : « section disparue entre l'écriture et la relecture » n'est atteignable qu'avec une transaction factice |
| `courses/report-section.test.ts` | 9 | `tests/integration/content/test_content_sections.py` | porté en 7 cas : les deux `INTERNAL_ERROR` sur insertion nulle décrivent une transaction factice |
| `courses/citation-source.test.ts` | 10 blocs (13 cas) | `tests/integration/content/test_content_citation_source.py` | porté (14 cas : la ressource d'un autre propriétaire est couverte en plus) |
| `courses/summary.test.ts` | 5 | `tests/integration/content/test_content_summary.py` | porté (validation, commit, correction, rejeu, brouillon différé) |
| `courses/validate-citations.test.ts` | 7 | `tests/unit/content/test_content_validate_citations.py` | porté |
| `courses/section-bricks.test.ts` | 5 | `tests/integration/content/test_content_sections.py` | porté |

Les deux entrées `courses/{citation-source,validate-citations}` sont annoncées « target spec
SPEC-2207 » par `evidence/SPEC-2001/test-port-map.md` (carte générée) ; le plan P22 les rattache au
contraire au périmètre content (« Course reading, sections, revisions, citations, summaries ») et
leurs cas d'usage sont déjà basculés `py` : elles sont portées ici.

## Divergences trouvées par le portage et corrigées dans le code Python

1. **Tableaux `uuid[]` lus comme des chaînes** — `as_string_array` (`course.py`, `sections.py`) ne
   gardait que les `str` ; psycopg rend des `uuid.UUID`, donc `notionIds` sortait vide et
   `report_course_section` ne suspendait aucune brique (BR-MEM-09). Les deux fonctions convertissent
   désormais les `UUID`.
2. **Corps de correction sans champ** — le contrat TypeScript (`CourseSectionEditBody`) exige
   `title` ou `contentMd` ; le schéma JSON généré ne peut pas exprimer ce `refine`, donc Python
   répondait 200 sans écrire. `edit_course_section` refuse maintenant en `VALIDATION_FAILED` avec le
   message et le chemin du contrat.
3. **Motif de signalement vide** — `reason` est `trim().min(1)` côté TypeScript ; Python stockait des
   espaces. `report_course_section` taille le motif, refuse le vide et enregistre la valeur taillée.
4. **Ponctuation du 409** — `edit-section.ts` écrit `Version actuelle : 3.` ; la constante partagée
   n'avait pas le point final (elle sert aussi à `rename`, qui n'en veut pas). Une constante dédiée
   `SECTION_VERSION_CURRENT` rétablit le libellé exact.

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
  `packages/ingestion/fixtures/pdf.ts` (aucun binaire committé) ; `tests/factories/files_support.py`
  porte aussi les signatures d'image de `packages/services/test/support/files.ts`.
- Les fixtures de recherche sont celles déjà committées sous `packages/llm/fixtures/search/`.
- Les identifiants, titres et valeurs des cas unitaires (`progress`, `validate-citations`, `upload`)
  sont ceux du TypeScript, recopiés tels quels ; les cas d'intégration sèment les mêmes lignes
  (module en position 3 sur 7, deux chapitres, sections `text`/`retain`, citation page 4) dans
  `tests/factories/course_support.py`.

## Totaux

- Avant cette tranche : 1 631 tests verts (`bb95b145`).
- Après cette tranche : **1 727 tests verts** (+96), dont les nouveaux modules :
  - `test_content_progress_rules.py` : 4 cas ;
  - `test_content_validate_citations.py` : 8 cas ;
  - `test_content_upload_limits.py` : 23 cas ;
  - `test_content_course.py` : 9 cas d'intégration ;
  - `test_content_progress.py` : 8 cas d'intégration ;
  - `test_content_sections.py` : 22 cas d'intégration ;
  - `test_content_citation_source.py` : 14 cas d'intégration ;
  - `test_content_uploads.py` : 8 cas d'intégration.
