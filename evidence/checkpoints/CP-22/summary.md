# Checkpoint CP-22 — Migration Python — domaines métier

- Date : 2026-11-23
- Résultat : ✅ réussi **avec exception consignée** (décision du porteur)
- Spécifications de la phase : SPEC-2201, SPEC-2202, SPEC-2203, SPEC-2204, SPEC-2205, SPEC-2206, SPEC-2207 — toutes `done` et fusionnées

## Ce qui est vérifié

| Contrôle | État |
|---|---|
| `audit.mjs` | ✅ aucune erreur, aucun avertissement |
| lint Python (`py:lint`) | ✅ ruff + import-linter (2 contrats, 0 cassé) |
| typecheck | ✅ `mypy` 654 fichiers + `tsc` web |
| build | ✅ `@learny/web` (Turborepo) |
| unit | ✅ 3 669 tests Vitest |
| intégration | ✅ 4 601 tests pytest, 11 ignorés, après `pnpm db:reset` |
| e2e ciblés (après correctifs) | ✅ 40 réussis / 15 échecs attendus (13 `@visual`, 2 SPEC-602) |

## Campagne e2e complète (état `ee3d95fe`, avant correctifs)

505 entrées : **246 réussies, 227 en échecs, 32 ignorées**. Répartition : 206 visuels
(192 comparaisons de captures, 14 échecs de contenu), 21 fonctionnels. Les 227 échecs sont
classés dans `evidence/checkpoints/preexisting-e2e-failures.md` et la présente exception.

## Exception

- **Captures `@visual`** : les lignes de base d'avant le 2026-11-20 ont été prises avec la police
  de repli (largeur Arial 362 px) alors que l'application rend en Inter (377 px). Le revert du
  pipeline de polices ne change que 0,13 % des pixels et 4/4 tests typographiques échouent encore.
  Décision du porteur : **aucune régénération** ; les captures restent en exception, avec la preuve
  pixel consignée. Les baselines mobiles manquantes (SPEC-1101/1102/1103, SPEC-725) relèvent du
  même constat.
- **Compteurs d'inventaire** : ADR-2036 ne couvrait pas l'état réel. **ADR-2039** aligne les
  constantes des tableaux de bord sur les inventaires générés (60 tables/60 RLS/service 7 ;
  50 événements/132 lacunes ; 201/217 et 19 entrées relayées). Les tests SPEC-113, SPEC-2001,
  SPEC-2207 et SPEC-2301 passent avec ces valeurs, sans régénération de capture.
- **SPEC-602** (2 tests) : l'oracle contredit le refactor SPEC-709/ADR-0340 (champ modèle vide,
  flux `create` au lieu de `qualify`). Aucune assertion modifiée ; exception documentée.
- **SPEC-1301** : démo encore servie par TypeScript, portage prévu à l'étape 3.

## Correctifs de la phase

`spec-301` (relais du serveur secondaire), `spec-2206` (export laissé au worker), `spec-1102`
(session de démo), `spec-2101` (Bearer réel), `spec-510` (modèle de vision), `spec-604` (modèle du
tutorat), `spec-605` (marqueur de cadrage), `spec-611` (contrat de correction + modèle), `spec-704`
(limiteur de la pile e2e), `spec-712` (reproposition après annulation), `spec-803` (limiteur, pas
une violation axe), plus deux garde-fous d'intégration. Commits : `b3513354`, `1159adc3`,
`35789135`, `ae130e97`, `d37a82be`, `a5fdaef4`, `9c4229dc`, `868e2241`, `cb91c254`, `b2545f1d`,
`e5508e4d`, `c5d9d22c`, `a0a98253`, `f0b0f954`.

## Décision

Le porteur a autorisé le passage en exception (pas de régénération des lignes de base) et la mise à
jour des constantes de compteurs (ADR-2039). Le défaut de rendu des polices reste ouvert et devra
être tranché séparément (régénération ou conservation de l'exception).
