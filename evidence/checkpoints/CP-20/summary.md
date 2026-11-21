# Checkpoint CP-20 — Migration Python : inventaire, contrat et socle

- Date : 2026-11-21
- Résultat : ✅ réussi **avec exception consignée** (décision du porteur du projet)
- Spécifications de la phase : SPEC-2001, SPEC-2002, SPEC-2003 — toutes `done` et fusionnées

## Pourquoi une exception

Le checkpoint rejoue la suite e2e **complète**, qui est rouge sur `main` indépendamment de la
piste : trois tests de `apps/web/e2e/specs/p0/spec-006.spec.ts` (santé, 404, visuel) échouent
parce que la **ligne de base visuelle versionnée affiche `status degraded`** alors que l'assertion
du test attend `ok` — les deux oracles du dépôt se contredisent, et ADR-2008 interdit de modifier
l'un comme l'autre. Analyse complète : `evidence/SPEC-2003/preexisting-e2e-failures.md`, ADR-2019.

Les deux tentatives d'exécution du checkpoint (2026-11-21) n'ont pas conclu : la seconde a tourné
plus de 75 minutes sans terminer, la suite complète étant très lente sur la VM de dev.

## Ce qui est vérifié pour la phase

| Contrôle | État |
|---|---|
| `audit.mjs` | ✅ aucune erreur, aucun avertissement |
| lint | ✅ |
| typecheck | ✅ (TypeScript + `mypy` strict sur 27 fichiers Python) |
| build | ✅ |
| unit | ✅ 3 634 tests Vitest + 59 tests pytest |
| intégration | ✅ Vitest + 4 tests pytest de la façade |
| e2e (non-régression complète) | ❌ **bloqué** par le défaut préexistant de SPEC-006, identique sur `main` |

## Décision

Le porteur du projet a autorisé le passage de CP-20 en exception pour poursuivre la piste (P21).
Le défaut de SPEC-006 reste ouvert et devra être tranché séparément.
