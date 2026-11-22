# Acceptation — SPEC-2203 (domaine Content & Retrieval et ingestion en Python)

Périmètre : **18 opérations** du contexte `content` de `api/inventory.json` (voir `scope.md` pour
l'écart avec le « 19 » du plan P22), l'ingestion des cinq types d'apport et la recherche
(`search_user_content`). Dernier commit de la branche : `git log -1 --format=%H`.

Les chiffres de périmètre viennent de `api/inventory.json` (généré par SPEC-2001) et de
`api/ownership.yaml` ; la matrice complète opération → cas d'usage → tables → tests est dans
[`scope.md`](./scope.md), la campagne de parité dans [`parity.md`](./parity.md).

## CA-1 — Toutes les opérations du périmètre sont à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ✅

- **18 / 18** opérations du contexte `content` sont à `py` dans `api/ownership.yaml` (aucune
  restante en `ts`), et `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` a
  toujours un handler : **18 handlers pour 18 opérations `py`**, aucune route `ts` servie par
  Python.
- Cas d'usage du job `ingest-resource` :
  `learny/content/application/ingestion.py::process_resource` est porté comme cas d'usage
  reprenable — cinq étages durables `load`, `extract`, `chunk`, `embed`, `finalize`, chacun relisant
  l'état persisté, la finalisation remplaçant les passages en une transaction. Il est branché au
  worker en SPEC-2207 et prouvé dès maintenant par
  `packages-py/learny/tests/integration/content/test_content_ingestion.py`.
- Matrice entrée → cas d'usage → règles → tables → tests : section « Matrice » de
  [`scope.md`](./scope.md), une ligne par opération, plus les tableaux du domaine pur, de
  l'ingestion et de la plateforme.

## CA-2 — Parité contractuelle du périmètre, zéro divergence inexpliquée ✅

- Campagne exécutée le **2026-11-22** : Hono `:3112` pour l'enregistrement, façade `:3101` pour le
  rejeu, base remise à zéro sous `flock`, horloge figée au 2026-11-11T12:20:00Z, `LLM_MODE=mock`,
  `TZ=UTC`. Procédure, sorties et analyse : [`parity.md`](./parity.md).
- Le groupe `content` ne génère **aucun scénario**, et c'est structurel : `generatedScenarios` ne
  retient que les lectures sans paramètre de chemin, or les quatre lectures du contexte
  (`modules.screen`, `modules.course`, `resources.readUrl`, `course-citations.source`) portent
  `:mid`, `:rid` ou `:cid`, et les quatorze autres opérations sont des mutations. L'outil refuse
  explicitement un groupe vide (`Error: no scenario in group(s) content`) ; **rien n'a été
  enregistré, rien n'a été inventé**, et ce refus est consigné tel quel dans `parity.md`.
- Ce que la campagne prouve tout de même, et sans régression : les quatre groupes déjà enregistrés
  ont été rejoués contre la même façade, **14 scénarios à l'identique, zéro divergence**
  (`identity` 7, `formation` 2, `learning` 4, `assessments` 1). `git status --short
  api/oracles/recordings/reads.json` est vide : l'oracle de SPEC-2001 est inchangé, aucune ligne de
  base n'a été régénérée.
- Preuves de remplacement pour les 18 opérations : tests d'intégration serveur sous RLS, codes
  d'erreur, événements, idempotence et effets en base (`test_content_resources.py`,
  `test_content_uploads.py`, `test_content_summary.py`, `test_content_course.py`,
  `test_content_progress.py`, `test_content_progress_rules.py`, `test_content_sections.py`,
  `test_content_citation_source.py`, `test_content_ingestion.py`), plus l'e2e `@SPEC-2203` qui
  traverse le web et la façade pour `modules.screen`, `modules.course` et `resources.rename`.
  **Zéro divergence inexpliquée.**

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ✅

- [`test-port-map.md`](./test-port-map.md) : carte cas par cas (fichier TypeScript → fichier
  pytest → nombre de cas → fixture) pour le domaine (découpage, sélection du contexte, embeddings,
  citations, bornes), l'ingestion et les extracteurs (`note`, `pdf`, `image`, `web`, `youtube`,
  `safe_fetch` et ses gardes), les adaptateurs Voyage et Tavily, le résumé de chapitre, puis
  `resources/upload`, `courses/get-course`, `get-course-detail`, `progress`, `progress.service`,
  `edit-section`, `report-section`, `citation-source`, `validate-citations` et `section-bricks`.
- Les seuls cas sans équivalent sont des états atteignables uniquement avec une transaction
  factice ; ils sont listés avec leur motif dans `test-port-map.md`.
- Suite Python complète : **1 727 tests** verts (+96 sur les 1 631 de `bb95b145`), `mypy` strict,
  `ruff check`, `ruff format --check` et `lint-imports` verts ; `api/inventory.json` régénéré à
  l'identique pour les opérations (217 opérations, seul le rattachement du nouveau test e2e à
  `modules.screen` apparaît).

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts, 1 contrat conservé.
- Les handlers `apps/api-py/src/learny_api/handlers/content.py` ne contiennent aucune règle : ils
  lisent les modèles générés et appellent un cas d'usage par opération
  (`learny/content/public.py`). Aucun handler ne manipule de requête SQL ni de décision métier.
- Les règles vivent dans `learny/content/domain/` (découpage, sélection et formatage du contexte,
  embeddings, citations, bornes), les extracteurs et les requêtes dans
  `learny/content/infrastructure/`, et les adaptateurs sortants dans `learny/platform/`
  (`safe_fetch`, `embeddings`, `search`, `storage`). Les contrats interdisent au domaine de dépendre
  de FastAPI, SQLAlchemy ou des SDK.

## CA-5 — Les e2e du périmètre passent sans modification à travers la façade Python ✅

- `PLAYWRIGHT_REUSE_SERVER=0 pnpm test:e2e --grep "@SPEC-2203\b"` : **2 tests verts**, dont
  **1 test `@visual`** ; rapports `e2e.json` et `e2e.xml`, vidéos, captures et résultats axe dans
  `evidence/SPEC-2203/`.
  - `apps/web/e2e/specs/p22/spec-2203.spec.ts` : session réelle (`createTestSession`), formation,
  module, chapitre et note semés par les fabriques ; `modules.screen` (`GET /api/v1/modules/:mid`)
  répond **200** avec `x-served-by: learny-api` et le contrat attendu (formation, module, unique
  chapitre sélectionné, ressource du chapitre) ; `modules.course`
  (`GET /api/v1/modules/:mid/course`) répond **200** (cours absent, génération `none`, chapitre à
  `0 %`) ; `resources.rename` (`PATCH /api/v1/resources/:rid`) répond **200** avec le nouveau titre
  et la version à jour, sans second effet. Le même `modules.screen` sur un identifiant absent répond
  **404** `NOT_FOUND` en `application/problem+json` : le contrat d'erreur traverse la façade.
  - Test `@visual` : `axeCheck` sans violation sérieuse ou critique, puis `captureEvidence` desktop
    (1440 × 900) et mobile (390 × 844) de la page `/_dev/sdd/SPEC-2203`, qui annonce **18 / 18**
    opérations servies par Python, l'ingestion (`note`, `pdf`, `image`, `web`, `youtube`,
    `safe_fetch`, `process_resource`) et la recherche (découpage, embeddings, `search_user_content`,
    Voyage/Tavily).
- Les e2e existants du périmètre passent sans modification à travers la façade ; aucune assertion
  d'oracle ni ligne de base visuelle existante n'a été modifiée (ADR-1001, ADR-2008). Les captures de
  cette spécification sont des preuves, pas des lignes de base
  (`git diff <commit de départ> -- apps/web/__screenshots__` est vide).

## Contrôles de qualité

Mesures du **2026-11-22** sur la VM de développement (Supabase local, horloge figée au
2026-11-11T12:20:00Z, `LLM_MODE=mock`, `TZ=UTC`) ; les étapes `validate.mjs` sont enregistrées dans
[`checks.json`](./checks.json) avec leur horodatage.

| Contrôle | Commande | Résultat |
|---|---|---|
| Lint Python | `uv run ruff check .` et `uv run ruff format --check packages-py apps` | vert |
| Types Python | `uv run mypy packages-py apps` | vert |
| Import-linter | `uv run lint-imports` | vert |
| Unités et intégration Python | `uv run pytest packages-py apps -q` | vert (**1 727 tests**) |
| Contrat Python | `pnpm py:contract:check` | vert (artefacts générés inchangés) |
| Inventaire | `tsx tools/migration/inventory.mjs --check` | vert (217 opérations) |
| Lint racine | `pnpm lint` | vert |
| Types racine | `pnpm typecheck` | vert |
| Construction | `pnpm build` | vert |
| Unités TypeScript | `pnpm test:unit` | vert (aucun test TypeScript étiqueté `[SPEC-2203]`) |
| Intégration TypeScript | `pnpm test:int` | vert |
| e2e du périmètre | `pnpm test:e2e --grep "@SPEC-2203\b"` | vert (2 tests, 1 `@visual`, 4 vidéos) |
| Validation SDD | `node tools/sdd/validate.mjs SPEC-2203` | 8 étapes vertes : lint, typecheck, build, unit (174 pytest), intégration (77 pytest), e2e (2), visuel (1), acceptance (5/5) |
| Parité | `pnpm parity:check` sur `identity`, `formation`, `learning`, `assessments` | vert (14 scénarios, 0 divergence) ; `content` vide par construction, voir `parity.md` |

## Anomalies et décisions

- **Quatre divergences corrigées dans le code Python** (jamais dans un test), trouvées en portant
  les cas : `uuid[]` rendu par psycopg et filtré aux chaînes (briques jamais suspendues), corps de
  correction sans champ éditable accepté, motif de signalement vide enregistré, point final du
  message de conflit manquant. Détail et preuve : [`test-port-map.md`](./test-port-map.md).
- **Décompte 19 vs 18** : le plan P22 et le titre de la spec annoncent 19 opérations ; l'inventaire
  en contient 18 pour `context == "content"` (aucune route spéciale, aucun job associé). L'inventaire
  fait foi (ADR-2005) ; aucune entrée n'a été inventée. Le titre de la page de démonstration et les
  compteurs sont lus dans l'inventaire, ils affichent donc 18.
- **`js_number` corrigé** : `learny/shared/jsmath.py` rendait `5.2e-05` là où `Number#toString`
  rend `0.000052` (plage [-6, 21)). Corrigé et verrouillé par
  `tests/unit/content/test_content_embeddings.py` (empreinte SHA-256 du vecteur sérialisé).
  Aucune ligne de base ni assertion d'oracle existante n'a été modifiée.
- **Premier usage `learny.tutor`** : `startersOf` (SPEC-610 EF-2) est porté dans
  `learny/tutor/domain/starters.py` et exposé par `learny/tutor/public.py`, conformément à la règle
  du premier usage du plan P22 ; il est consommé par `modules.course`.
- **`learny.platform.storage.mint_user_access_token`** ajouté (port de `mintUserAccessToken`,
  SPEC-206 ET-4) : le port Python n'en avait pas besoin avant les URL signées de `content`.
- **Extracteurs** : `pypdf` et `readability-lxml` remplacent PDF.js et linkedom/Readability. Sur les
  fixtures committées, le texte principal, les pages, les ancrages et les bornes sont identiques
  après normalisation ; `readability-lxml` conserve l'ancrage du `h1` (superset) et normalise le
  tiret cadratin du titre. Aucun écart ne change une frontière de passage ni une citation
  (`parity.md` § « Parité des extracteurs »).
- **Groupe de parité `content` vide** : aucune divergence mesurée, donc rien à corriger ; le groupe
  ne produit aucun scénario parce que toutes les lectures portent un paramètre de chemin. Ce n'est
  pas un échec : c'est le cas prévu par le plan P22, et les preuves d'intégration et l'e2e le
  remplacent (CA-2, CA-5).
- **Fixture YouTube hors du registre des modèles** : `packages/llm/fixtures/youtube/captions.json`
  (ajouté avec l'ingestion) contient la transcription publique lue par l'extracteur Python ; ce n'est
  pas une fixture de modèle simulé. Le test SPEC-504 qui vérifie l'exhaustivité du registre des
  fixtures de modèle exclut donc ce répertoire, comme `search` et `qualification`, qui ont leur
  propre lecteur et leurs propres tests (`test_content_extract.py`). Cette fixture n'a jamais été
  dans `FIXTURE_REGISTRY` : l'assertion sur les fixtures de modèle n'est pas affaiblie, la
  régression de la suite unitaire introduite par l'ingestion est corrigée.- **Aucune assertion d'oracle ni ligne de base régénérée** : `git status --short
  api/oracles/recordings/reads.json` vide après la campagne ; `apps/web/__screenshots__` inchangé.

## Dettes portées par SPEC-2207 (worker et consommateurs)

- `process_resource` est porté, testé et appelable ; le branchement au worker Python (dispatcher,
  étages durables) arrive en SPEC-2207 (ADR-2014, ADR-2006). Aucune réponse HTTP n'en dépend.
- Les consommateurs d'événements de contenu (`course-generation` sur
  `chapter/contributions-completed`, `resource/ready`, `resource/failed`) restent TypeScript
  jusqu'à SPEC-2207 ; les événements sont écrits dans la transaction métier avec leurs identifiants
  stables, donc un rejeu ne produit ni second effet ni second événement.
- Upload PDF vers Anthropic Files : le port `UploadPdf` existe et l'extraction texte est complète ;
  le défaut renvoie `None` tant que la résolution BYOK n'est pas branchée (SPEC-2204). Le TypeScript
  ne téléverse de toute façon que pour un modèle Anthropic choisi par l'apprenant.
