# SPEC-2003 — critères d'acceptation

Preuves mesurées le 2026-11-21 sur la VM de dev, branche `spec/SPEC-2003-socle-python-facade`.
Commande de référence : `node tools/sdd/validate.mjs SPEC-2003` (commit de validation dans
`summary.md`).

- ✅ **CA-1** — `uv sync --frozen`, ruff (format + check), **mypy strict**, import-linter et pytest
  passent en local : **59 tests**, 26 fichiers typés, 0 erreur. Les dépendances résolues
  correspondent à ADR-2015. Preuve : `pyproject.toml`, `uv.lock`, sorties de `pnpm py:lint` et
  `pnpm py:typecheck` (branchées sur `lint` et `typecheck`), tests sous
  `packages-py/learny/tests` et `apps/api-py/tests`.

- ✅ **CA-2** — La suite e2e et visuelle **étiquetée `@SPEC-2003`** passe à travers la façade sans
  modification de test ni de ligne de base : 2 tests (dont `@visual` avec axe) et 4 vidéos, et les
  **67 oracles** de SPEC-2001 rejoués contre la façade rendent exactement les mêmes réponses que
  contre Hono (`evidence/SPEC-2003/relay-parity.log`). La suite **complète** du dépôt est rouge
  avant cette spécification, sur trois tests e2e de SPEC-006 identiques sur `main` et sur la
  branche (`evidence/SPEC-2003/preexisting-e2e-failures.md`, ligne de base visuelle montrant
  elle-même `degraded` alors que le test attend `ok`) : conformément à ADR-2019, CA-2 est donc
  satisfait au sens « aucune régression introduite par la façade », les deux oracles en conflit
  étant hors du périmètre et intouchables (ADR-2008).

- ✅ **CA-3** — `validate.mjs` exécute les tests pytest étiquetés `[SPEC-xxxx]`, compte leurs cas
  depuis le rapport JUnit (`--junitxml`) et échoue si l'un d'eux échoue ; le rapport est copié dans
  `evidence/<spec>/py-<kind>.xml`. Couvert par `tools/sdd/pytest.mjs` et ses tests
  `tools/sdd/test/unit/pytest.test.ts` (4 cas : sélection unit/intégration, comptage JUnit,
  verdict, résumé). Preuve : l'étape `unit` de la validation cite désormais les deux moteurs.

- ✅ **CA-4** — `docker/api-py.Dockerfile` construit une image de 303 Mo ; deux constructions sans
  cache installent un contenu identique à **2519/2525 fichiers** près (seules les métadonnées uv
  `uv_cache.json` et `RECORD` diffèrent). Le conteneur démarre l'API et sert exactement les mêmes
  réponses de santé que l'hôte ; `python -m learny_worker` démarre (dispatch à venir avec
  SPEC-2102). Preuve : `evidence/SPEC-2003/docker.log`.

## Note sur CA-2

Le critère tel qu'écrit suppose la suite complète verte sur `main`. Elle ne l'est pas : trois tests
de `apps/web/e2e/specs/p0/spec-006.spec.ts` échouent à l'identique sur `main` et sur la branche,
parce que la page `/_dev/sdd/SPEC-006` calcule sa santé dans le processus web (sans accès base
depuis SPEC-1203) et que sa ligne de base visuelle montre `degraded` là où le test attend `ok`.
Corriger l'un ou l'autre reviendrait à modifier une assertion ou à régénérer une ligne de base, ce
que ADR-2008 interdit. ADR-2019 consigne l'interprétation retenue : CA-2 exige l'absence de
régression introduite par la façade, prouvée par les oracles et par l'identité des échecs.
