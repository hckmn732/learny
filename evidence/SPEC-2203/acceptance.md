# Acceptation — SPEC-2203 (domaine Content & Retrieval et ingestion en Python)

Périmètre : **18 opérations** du contexte `content` de `api/inventory.json` (voir `scope.md` pour
l'écart avec le « 19 » du plan P22). Dernier commit de la branche : `git log -1 --format=%H`.

## CA-1 — Toutes les opérations du périmètre à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ✅

- **18 / 18** opérations sont à `py` dans `api/ownership.yaml` : `chapters.summary` a basculé dans le
  même commit que son handler, `apps/api-py/tests/unit/test_handlers.py` est vert (18 opérations
  `py`, 18 handlers).
- Cas d'usage du job `ingest-resource` : `learny/content/application/ingestion.py::process_resource`
  est porté comme cas d'usage reprenable (étages `load`, `extract`, `chunk`, `embed`, `finalize`,
  `publish`), branché au worker en SPEC-2207 et prouvé par
  `tests/integration/content/test_content_ingestion.py`.
- Matrice entrée → cas d'usage → tables → tests : section « Matrice » de [`scope.md`](./scope.md).

## CA-2 — Parité contractuelle, zéro divergence inexpliquée ❌

- Campagne `parity:record|check --group content` **non exécutée** ; procédure et analyse de
  couverture dans [`parity.md`](./parity.md). Aucune mesure n'est présentée comme acquise.
- Le groupe `content` ne génère aucun scénario (toutes les lectures portent un paramètre de
  chemin) : la preuve repose sur les tests d'intégration, comme le plan P22 le prévoit.

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ✅

- Le périmètre est couvert : domaine (53 cas unitaires), ingestion/extracteurs/SSRF, adaptateurs
  Voyage et Tavily, résumé de chapitre, puis, dans cette tranche, `resources/upload`,
  `courses/get-course`, `get-course-detail`, `progress`, `progress.service`, `edit-section`,
  `report-section`, `citation-source`, `validate-citations` et `section-bricks`.
- La carte cas par cas (fichier TypeScript → fichier pytest → nombre de cas → fixture) et la liste
  des cas sans équivalent, tous des états atteignables seulement avec une transaction factice, sont
  dans [`test-port-map.md`](./test-port-map.md).
- Suite Python complète : **1 727 tests** verts (+96 sur les 1 631 de `bb95b145`), `mypy` strict,
  `ruff check`, `ruff format --check` et `lint-imports` verts ; `api/inventory.json` régénéré à
  l'identique (217 opérations).

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts, 1 contrat conservé.
- Les handlers `apps/api-py/src/learny_api/handlers/content.py` ne contiennent aucune règle : ils
  lisent les modèles générés et appellent un cas d'usage par opération.
  `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` a toujours un handler
  (18 handlers, 18 opérations `py`).
- Les règles vivent dans `learny/content/domain/` (découpage, sélection, embeddings, bornes), les
  extracteurs et les requêtes dans `learny/content/infrastructure/`, et les adaptateurs sortants
  dans `learny/platform/` (`safe_fetch`, `embeddings`, `search`).

## CA-5 — Les e2e du périmètre passent à travers la façade Python ❌

- Aucun test `@SPEC-2203` ni page `/_dev/sdd/SPEC-2203` n'a été écrit dans cette tranche : la page
  de démonstration doit annoncer 18/18 et sera livrée avec les e2e `@visual`. Reste à faire (voir
  `scope.md` § Reste à faire).

## Anomalies et décisions

- **Quatre divergences corrigées dans le code Python** (jamais dans un test), trouvées en portant
  les cas : `uuid[]` rendu par psycopg et filtré aux chaînes (briques jamais suspendues), corps de
  correction sans champ éditable accepté, motif de signalement vide enregistré, point final du
  message de conflit manquant. Détail et preuve : [`test-port-map.md`](./test-port-map.md).
- **Décompte 19 vs 18** : le plan P22 et le titre de la spec annoncent 19 opérations ; l'inventaire
  en contient 18 pour `context == "content"` (aucune route spéciale, aucun job associé). L'inventaire
  fait foi (ADR-2005) ; aucune entrée n'a été inventée.
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
- **Adaptateurs live non exercés** : Voyage et Tavily sont prouvés via `httpx.MockTransport`, le
  mode `mock` reste le défaut hors production ; l'upload PDF vers Anthropic Files renvoie `None`
  tant que la résolution BYOK n'est pas branchée (SPEC-2204), l'extraction texte restant complète.
