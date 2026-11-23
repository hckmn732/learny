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

## `pnpm -s build` → code 0

Le build Turbo (Next.js, 1 min 0 s) passe sans le backend TypeScript : il ne reste que
`@learny/web`. Les artefacts du build sont nécessaires au test `bundle-split` ci-dessous.

## `flock /tmp/learny-sdd-db.lock pnpm exec vitest run --project unit`

Première exécution, sans `pnpm build` : `1 failed | 1846 passed (1847)`, l'unique échec étant
`apps/web/test/unit/bundle-split.test.ts` (il lit le build de production absent).

Après `pnpm -s build` :

```
Test Files  236 passed (236)
     Tests  1847 passed (1847)
  Duration  51.59s
(exit 0)
```

Aucun test n'a été modifié, ignoré ni déplacé : le test `bundle-split` dépendait seulement des
artefacts de build, que le hook `pre-push` (`pnpm -s typecheck && pnpm -s test:unit`) exige donc
après un `pnpm build`.

## `pnpm run lint` — une erreur, hors zone de ce lot

`pnpm run lint` échoue sur un unique point, dans `apps/web/playwright.config.ts:47` :

```
error  'API_PORT' is assigned a value but never used  @typescript-eslint/no-unused-vars
```

`API_PORT = PORT + 12` était le port du serveur Hono retiré par le lot L4 ; la constante et son
commentaire sont restés. `apps/web/**` est une zone interdite à ce lot : la correction (supprimer
la constante et mettre à jour le commentaire « relays to Hono on PORT+12 ») revient au lot
propriétaire de `apps/web`. Toutes les autres entrées de `lint` passent (voir tableau ci-dessus).
