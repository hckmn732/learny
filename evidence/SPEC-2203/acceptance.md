# Acceptation — SPEC-2203 (domaine Content & Retrieval et ingestion en Python)

Périmètre : **18 opérations** du contexte `content` de `api/inventory.json` (voir `scope.md` pour
l'écart avec le « 19 » du plan P22). Dernier commit de la branche : `git log -1 --format=%H`.

## CA-1 — Toutes les opérations du périmètre à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ❌

- **17 / 18** opérations sont à `py` dans `api/ownership.yaml` ; `chapters.summary` reste `ts`.
- Cas d'usage des jobs du périmètre : `process_resource` (`ingest-resource`) **non porté** — le job
  reste `ts` jusqu'à SPEC-2207, mais EF-1 demande le cas d'usage ici.
- Matrice entrée → cas d'usage → tables → tests : section « Matrice » de [`scope.md`](./scope.md).

## CA-2 — Parité contractuelle, zéro divergence inexpliquée ❌

- Campagne `parity:record|check --group content` **non exécutée** ; procédure et analyse de
  couverture dans [`parity.md`](./parity.md). Aucune mesure n'est présentée comme acquise.

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ❌

- **Partiel** : domaine complet (53 cas unitaires) et 6 cas d'intégration serveur ; la carte
  d'état cas par cas est dans [`test-port-map.md`](./test-port-map.md).
- Suite Python complète : **1535 tests** verts (1529 + 6 d'intégration `content`), `mypy` strict,
  `ruff check`, `ruff format --check` et `lint-imports` verts.

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts (188 → 210 modules analysés, 1 contrat conservé).
- Les handlers `apps/api-py/src/learny_api/handlers/content.py` ne contiennent aucune règle : ils
  lisent les modèles générés et appellent un cas d'usage par opération.
  `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` a toujours un handler
  (17 handlers, 17 opérations `py`).
- Les règles vivent dans `learny/content/domain/` (découpage, sélection, embeddings, bornes) et les
  requêtes dans `learny/content/infrastructure/queries.py`.

## CA-5 — Les e2e du périmètre passent à travers la façade Python ❌

- Aucun test `@SPEC-2203` ni page `/_dev/sdd/SPEC-2203` n'a été écrit dans cette tranche : le
  contexte n'est pas encore basculé en entier, une page de démonstration annonçant 17/18 serait
  trompeuse. Reste à faire (voir `scope.md` § Reste à faire).

## Anomalies et décisions

- **Décompte 19 vs 18** : le plan P22 et le titre de la spec annoncent 19 opérations ; l'inventaire
  en contient 18 pour `context == "content"` (aucune route spéciale, aucun job associé). L'inventaire
  fait foi (ADR-2005) ; aucune entrée n'a été inventée.
- **`js_number` corrigé** : `learny/shared/jsmath.py` rendait `5.2e-05` là où `Number#toString`
  rend `0.000052` (plage [-6, 21)). Corrigé et verrouillé par
  `tests/unit/content/test_content_embeddings.py` (empreinte SHA-256 du vecteur sérialisé).
  Aucune ligne de base ni assertion d'oracle existante n'a été modifiée ; la suite complète reste
  verte (1529 → 1535).
- **Premier usage `learny.tutor`** : `startersOf` (SPEC-610 EF-2) est porté dans
  `learny/tutor/domain/starters.py` et exposé par `learny/tutor/public.py`, conformément à la règle
  du premier usage du plan P22 ; il est consommé par `modules.course`.
- **`learny.platform.storage.mint_user_access_token`** ajouté (port de `mintUserAccessToken`,
  SPEC-206 ET-4) : le port Python n'en avait pas besoin avant les URL signées de `content`.
