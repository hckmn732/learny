# Rapport d'exécution — piste `python-migration`

- **Date** : 2026-11-21
- **Machine** : VM de dev `ubuntu@100.111.204.24` — `/home/ubuntu/projects/learny`, branche `main`
- **Point de départ** : `4cd450d0` (main, à jour d'`origin/main`)
- **Point d'arrivée** : `e1ab00cf` poussé sur `origin/main` (voir `git log` pour les commits suivants de ce rapport)
- **Mode** : autonome, sans intervention humaine

## 1. Spécifications terminées

| Spécification | État | Validation | Fusion |
|---|---|---|---|
| **SPEC-2001** — Inventaire, matrice de parité et oracles de référence | `done` | `validate.mjs SPEC-2001` : lint, typecheck, build, unit (9 tests), intégration (2), e2e (2 + 4 vidéos), visuel (1), acceptance 5/5 ✅ | `6b87e0b6` (merge `--no-ff`), poussé |
| **SPEC-2002** — Contrat OpenAPI source unique et SDK TypeScript généré | `done` | `validate.mjs SPEC-2002` : lint, typecheck, build, unit, intégration, e2e (2 + 4 vidéos), visuel (1), acceptance 3/3 ✅ | `e1ab00cf` (merge `--no-ff`), poussé |

### Livrables de SPEC-2001

- `tools/migration/inventory.mjs` (+ `--check`, `--port-map`) : extrait **217 opérations**, **32 routes spéciales** (dont SSE `relayStream` et webhook Stripe), **49 événements**, **22 jobs** ; écrit `api/inventory.json` et `evidence/SPEC-2001/inventory.md`.
- `tools/migration/report.mjs` : `countRegistryRoutes` soustrait les `defineRoute(` des fabriques `demo()`/`action()` → **217** (au lieu de 219).
- `tools/parity/run.ts` + `tools/parity/scenarios/mutations.json` : **67 scénarios** enregistrés contre Hono puis rejoués **deux fois à l'identique** (`evidence/SPEC-2001/parity-check.log`).
- `tools/parity/export-vectors.ts` → `api/oracles/vectors/{jsonx,learning-engine,crypto}.json`, stables (`--check`).
- `evidence/SPEC-2001/test-port-map.md` : **443 fichiers de test backend (2 942 cas)** rattachés à un module pytest et à la spec qui les portera.
- `/_dev/sdd/SPEC-2001` : page de démonstration alimentée par les artefacts commités, test `@SPEC-2001` + `@visual` avec axe.

### Livrables de SPEC-2002

- `api/openapi.yaml` : OpenAPI 3.1 valide, **217 opérations** avec bloc `x-learny`, **398 schémas nommés** ; `api/errors.json` (**104 codes**), `api/events.schema.json` (**49 événements**) ; génération reproductible et `contract:check` branché sur `lint`.
- `packages/api-sdk` : SDK TypeScript généré (`schema.d.ts`, 754 Ko) commité et contrôlé par `sdk:check`, branché sur `lint`.
- `tools/contract/compat.mjs` + `api/contract-exceptions.yaml` : détecte les ruptures (opération retirée, schéma de réponse modifié, paramètre supprimé, sécurité changée, statut d'erreur retiré), n'accepte une exception qu'avec un ADR `ADR-xxxx` ; **0 rupture** entre le YAML et le JSON servi.
- `/_dev/sdd/SPEC-2002` : page de démonstration, test `@SPEC-2002` + `@visual`.

## 2. Checkpoints

**Aucun checkpoint n'a été passé.** CP-20 exige SPEC-2001, SPEC-2002 **et SPEC-2003** ; les deux premières sont `done`, la troisième n'est pas commencée. `next.mjs` renvoie donc `DÉMARRER SPEC-2003`.

## 3. Ce qui reste à faire (ordre de la piste)

| Reste | Phase | Contenu |
|---|---|---|
| SPEC-2003 | P20 | Socle Python (uv workspace, shared, codegen), façade FastAPI + relais Hono, Playwright à travers la façade, Docker |
| SPEC-2101, SPEC-2102 | P21 | Base/identité/RLS, outbox + worker |
| SPEC-2201 → SPEC-2207 | P22 | Portage des domaines métier et bascule des jobs |
| SPEC-2301, SPEC-2302 | P23 | Déploiement/bascule/rollback, retrait du backend TypeScript |
| CP-20 → CP-23 | — | Après que toutes les specs de chaque phase sont `done` |

**Reprise** : `cd /home/ubuntu/projects/learny && node tools/sdd/next.mjs` puis `node tools/sdd/start.mjs SPEC-2003` dans un worktree `learny-wt-SPEC-2003`.

## 4. Blocages

**Aucun blocage technique ou externe n'est consigné** : aucune spec n'a été marquée `blocked`, aucun `fail.mjs --external` n'a été nécessaire. Les dépendances externes utilisées (Supabase local, Mailpit, Inngest local) étaient disponibles et en mode mock/figé comme exigé par ADR-0047/ADR-0048.

Deux anomalies préexistantes de `main` ont été corrigées en cours de route, avec justification dans le commit :

1. `tools/migration/test/unit/report.test.ts` échouait sur `main` : le commit `4cd450d0` ajoutait les specs de la piste (qui nomment l'application worker retirée) sans élargir l'exclusion documentaire de l'assertion. Correction : `specs/` et `docs/architecture/` ajoutés aux emplacements « documentaires » — l'assertion continue d'interdire toute référence **exécutable**.
2. `packages/config/src/commit-rules.test.ts` échouait sur `main` : la règle commitlint accepte `CP-NOM` (docs/engineering/git.md §2) mais son assertion attendait l'ancien libellé. Correction : assertion alignée sur la règle, pas l'inverse.

## 5. ADR créés

- **ADR-2016** — Parité normalisée et scénarios de lecture générés (SPEC-2001).
- **ADR-2017** — Contrat OpenAPI enrichi sans modifier le JSON servi (SPEC-2002).

## 6. Environnement et disque

- `uv 0.13.9` installé au niveau utilisateur dans `~/.local/bin` (aucun paquet système touché, Python 3.14 système intact).
- `corepack pnpm` 10.34.9 utilisé partout (jamais le pnpm global).
- Supabase CLI **3.1.0** (VM) utilisée ; aucun écart de comportement rencontré avec la version de CI (2.122.1).
- **Disque : 19 Go libres (81 % utilisés)** après la piste. Les artefacts produits par les validations (`.next`, `test-results`, vidéos d'évidence) sont les principaux consommateurs ; `evidence/` est versionné comme prévu.
- Aucun conteneur ni image `learny-py-*` n'a été créé (SPEC-2003 non commencée). La stack Supabase de dev est restée intacte.

## 7. Points d'attention pour la reprise

1. **Ordering build → test unitaire** : `apps/web/test/unit/bundle-split.test.ts` lit `.next` et échoue si le build est absent. Le hook `pre-push` ne lance pas le build : exécuter `pnpm build` avant un `git push` sur une machine fraîchement nettoyée.
2. **Store pnpm** : un `pnpm store prune` agressif casse la résolution des dépendances du dépôt principal (liens vers des fichiers de store supprimés). Remède : `corepack pnpm install --frozen-lockfile --force`.
3. **Staging de SPEC-2301** : toujours absent (ADR-2009) ; le blocage `--external` sera attendu à ce moment-là et n'est pas une anomalie.
4. **`pnpm db:reset`** est requis par le `global-setup` des tests e2e : les campagnes e2e réinitialisent la base partagée, à sérialiser par `flock /tmp/learny-sdd-db.lock`.
