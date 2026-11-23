# Preuve — bascule progressive par surcharge de propriété (SPEC-2301, EF-2, CL-1)

**Date** : 2026-11-23. **Environnement** : VM de développement, dépôt et inventaire réels,
`api/inventory.json` (217 opérations, 32 routes spéciales) et `api/ownership.yaml` (190 opérations
`py`, 29 routes spéciales `py`, 23 consommateurs, 2 crons). Aucune mesure de staging.

## L'outil

`tools/deploy/cutover.mjs` (ESM, `yaml`, aucune dépendance hors ADR-2015) produit
`OWNERSHIP_OVERRIDES` à partir du tableau de propriété et de l'inventaire :

| Étape | Effet | Refus |
|---|---|---|
| `--stage reads` | GET du contexte → `py`, mutations maintenues `ts`, joker `"*":"ts"` | `WRITES_FIRST` si les mutations sont déjà `py` |
| `--stage writes` | toutes les mutations du contexte → `py`, d'un bloc | `READS_NOT_PROMOTED` si le canary n'est pas fait ; `TWO_WRITERS` si une mutation est des deux côtés |
| `--stage rollback` | tout le contexte → `ts` | — |
| `--all --stage rollback` | `{"*":"ts"}` : relais total | — |
| `--all --stage writes` | `{}` : fin de bascule, le tableau versionné s'applique | — |
| `--check <json>` | vérifie les entrées connues | entrée inconnue |

`py@<pourcentage>` est **refusé** : la façade ne lit que `ts` et `py`
(`learny.shared.ownership.overrides_from_env`), une valeur ignorée ferait croire à une bascule qui
n'a pas lieu. Le canary est donc **par étape de contexte** (lectures puis mutations), pas par seau
d'utilisateurs ; c'est la limite consignée du plan P23 § 3.

## Ajout nécessaire côté façade : le joker

Le plan P23 étape 1 prescrit `OWNERSHIP_OVERRIDES={"*":"ts"}` ; le code ne l'acceptait pas (le
`"*"` aurait été rejeté comme opération inconnue à la validation de complétude). Ajout dans
`learny.shared.ownership` : `WILDCARD = "*"` et `apply_overrides`, qui étend le joker puis laisse
une entrée explicite gagner. Utilisé par la façade (`learny_api.main.load_ownership_checked`) et par
le worker (`load_ownership_for_worker`). `overrides_from_env` garde son contrat : il ne retient que
`ts` et `py`.

## Preuves exécutées

```bash
corepack pnpm exec vitest run --project unit tools/deploy/cutover.test.ts   # 12 cas réussis
uv run pytest apps/api-py/tests/unit/test_cutover_contract.py -q            # 8 cas réussis
```

Les cas Vitest couvrent le canary (lectures seules), la promotion atomique, les refus
(`READS_NOT_PROMOTED`, `WRITES_FIRST`, `TWO_WRITERS`, `VALID_OWNER`, contexte et étape inconnus), le
rollback d'un contexte sans toucher aux autres, la compaction (joker) et la stabilité du JSON.

Les cas pytest exécutent **l'outil réel** et relisent sa sortie avec le runtime :

- le JSON du canary est accepté sans perte par `overrides_from_env`, puis `apply_overrides` donne
  les lectures `py`, les mutations `ts`, le reste du contrat `ts` ; `validate_completeness` passe ;
- la promotion donne tout le contexte `py` ;
- `--all --stage rollback` donne `{"*":"ts"}` et met **les quatre sections** (opérations, routes
  spéciales, consommateurs, crons) à `ts` ;
- `--all --stage writes` donne `{}`, égal au tableau versionné ;
- les refus `TWO_WRITERS`, `READS_NOT_PROMOTED`, `INVALID_OWNER` sortent en code 2 avec le code
  d'erreur attendu et **aucune sortie** sur stdout ;
- `load_ownership_for_worker` lit le joker de son environnement et l'entrée explicite gagne.

## Mesure locale (exemple réel)

```
$ node tools/deploy/cutover.mjs --relay-only --context learning --stage reads
{"*":"ts","agenda.get":"py","formations.finalReview":"py","gaps.list":"py",
 "review.globalQuizToday":"py","series.milestones":"py","series.streak":"py",
 "slots.alternatives":"py","warmups.today.get":"py"}
$ node tools/deploy/cutover.mjs --context learning --stage writes --current '…'
{"*":"ts", … 16 entrées, toutes les mutations de learning en py}
$ node tools/deploy/cutover.mjs --context learning --stage writes --current '{"*":"ts"}'
refus (READS_NOT_PROMOTED) : canary de lecture non terminé (agenda.get, …)
$ node tools/deploy/cutover.mjs --context learning --stage writes \
  --current '{"*":"ts","slots.move":"py"}'
refus (TWO_WRITERS) : mutations des deux côtés (py, ts) sur formations.maintenance, …
```

## Ce qui n'est pas prouvé ici

Le canary **mesuré** (5xx, p95, alertes) sur le staging fourni par le porteur, l'auto-rollback
déclenché par une métrique hors seuil (CL-1) et la promotion d'un contexte en production : **bloqué
externe** (ADR-2009, CA-2/CA-4), consigné par `fail.mjs --external`. Le runbook
`docs/operations/python-cutover.md` § 4 porte les commandes et les critères d'arrêt.
