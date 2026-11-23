# SPEC-2302 — suites Python (collecte et exécution)

Mesures du 2026-11-23, worktree `~/learny-wt-py100-l6`, Python 3.13 (uv), PostgreSQL local.

## Collecte

```
$ uv run pytest --collect-only -q
4561 tests collected in 8.42s
```

La collecte couvre `packages-py`, `apps/api-py` et `apps/worker-py` (`testpaths` de
`pyproject.toml`), y compris les tests étiquetés `[SPEC-xxxx]` sélectionnés par
`tools/sdd/validate.mjs` (filtre `git ls-files | grep -lF "[SPEC-xxx]"`, `selectPythonTests` de
`tools/sdd/pytest.mjs` : `tests/integration/` pour l'intégration, le reste pour l'unitaire).

## Garde-fous de couverture du contrat

```
$ flock /tmp/learny-sdd-db.lock uv run pytest \
    apps/api-py/tests/unit/test_route_coverage.py \
    apps/api-py/tests/unit/test_contract_artifacts.py -q
................                                                         [100%]
16 passed in 5.96s
```

- `test_route_coverage.py` (`[SPEC-2302]`) lit `api/inventory.json` : chaque opération du contrat a
  exactement un handler et une installation, les 11 routes spéciales sont installées par le
  registre spécial, aucun handler orphelin, et une opération sans handler est refusée au démarrage.
- `test_contract_artifacts.py` (`[SPEC-2201]`) vérifie que la table générée et l'inventaire portent
  les mêmes 156 opérations et la même politique.

## Suite complète

La suite pytest complète (4 561 cas, base Supabase locale requise) n'a pas été rejouée dans ce lot
de documentation et d'outillage : elle appartient à la campagne de validation de SPEC-2302 (voir
`acceptance.md`, CA-1 et CA-4).

## Sélection pytest de `tools/sdd/validate.mjs` sur l'arborescence finale

`validate.mjs` cherche les fichiers qui contiennent `[SPEC-xxx]` (`git ls-files -co`), garde les
`.py` hors `.venv`, puis `selectPythonTests` sépare `tests/integration/` du reste. Mesure du
2026-11-23 pour `SPEC-2302` :

```
fichiers Python étiquetés [SPEC-2302] : 3
sélection unitaire : ["apps/api-py/tests/unit/test_route_coverage.py"]
sélection intégration : ["apps/api-py/tests/integration/test_special_sprints_route.py",
                         "packages-py/learny/tests/integration/assessments/test_assessments_brick_create.py"]
verdict sans fichier (neutre) : true
```

La sélection ne dépend d'aucun nom de dossier métier (elle a survécu au renommage du dossier
`learning-engine` de `packages-py`) et ne cite plus `apps/api` : le seul chemin backend est
`apps/api-py`.
