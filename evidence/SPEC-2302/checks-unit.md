# SPEC-2302 — contrôles statiques et suite unitaire (TypeScript)

Mesures du 2026-11-23, worktree `~/learny-wt-py100-l6` (branche `chore/py100-l6`),
Node 24 / pnpm 10.34.9 / Python 3.13 (uv).

## `pnpm -s turbo run typecheck` → code 0

Tous les paquets TypeScript et `tsc -p tsconfig.tools.json --noEmit` passent ; `py:typecheck`
(mypy strict sur `packages-py`, `apps/api-py`, `apps/worker-py`) compris dans la même commande.

## Chaîne « tout est à jour » → codes 0

| Commande | Code | Sortie |
|---|---|---|
| `pnpm run contract:check` | 0 | `✔ contrat à jour` |
| `pnpm run sdk:check` | 0 | `✔ SDK à jour` |
| `pnpm run py:contract:check` | 0 | `✔ artefacts Python du contrat à jour` |
| `pnpm run db:check` | 0 | base à jour |
| `pnpm run rls:check` | 0 | matrice RLS à jour |
| `node tools/migration/report.mjs --check` | 0 | `Contrôle réussi : apps/web n'importe que des paquets existants` |
| `node tools/migration/inventory.mjs --check` | 0 | `Inventory up to date: 156 operations.` |
| `node tools/sdd/audit.mjs` | 0 | `Erreurs : 0`, `Avertissements : 0` |
| `pnpm run py:lint` (`ruff format --check`, `ruff check`, `lint-imports`) | 0 | `Contracts: 2 kept, 0 broken.` |

## `flock /tmp/learny-sdd-db.lock pnpm exec vitest run --project unit`

```
Test Files  1 failed | 235 passed (236)
     Tests  1 failed | 1846 passed (1847)
  Duration  55.25s
```

Unique échec : `apps/web/test/unit/bundle-split.test.ts` — « ne charge pas la carte, le tuteur ni
les jeux dans /accueil ». Il mesure le découpage du bundle de production et exige `pnpm build`
(absent de ce lot) ; échec connu et hors périmètre de SPEC-2302 (aucun fichier de ce test n'est
modifié par la branche). Tous les autres tests unitaires passent, y compris
`packages/api-sdk/src/schema.test.ts` qui lit `api/inventory.json`.
