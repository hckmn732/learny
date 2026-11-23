# SPEC-2302 — acceptation

**Statut de la spécification : `in_progress`.** Ce document consigne, critère par critère, ce qui est
prouvé, comment, et ce qui ne l'est pas encore. Aucune preuve n'est extrapolée : ce qui n'a pas été
mesuré est marqué ❌ avec la raison.

- Branche : `chore/py100-l6`, worktree `~/learny-wt-py100-l6`, sur `chore/backend-100-python`.
- Date des mesures : 2026-11-23 (Europe/Paris).
- Environnement : VM de développement, Node 24 / pnpm 10.34.9 / Python 3.13 sur uv, Supabase local
  par Docker, `LLM_MODE=mock`, horloge figée 2026-11-11T12:20:00Z.
- Aucun accès au staging du porteur (ADR-2009) : ni charge, ni canary, ni restauration chronométrée.

## CA-1 — La suite complète passe contre Python, cross-browser et axe compris, sans modification d'assertion

**Partiellement prouvé.**

| Preuve | Commande | Résultat |
|---|---|---|
| Suite unitaire TypeScript (web, contrat, outils) | `pnpm -s build` puis `flock /tmp/learny-sdd-db.lock pnpm exec vitest run --project unit` | **236 fichiers, 1847 tests, exit 0** — aucune assertion modifiée par ce lot (détail : `checks-unit.md`) |
| Build sans backend TypeScript | `pnpm -s build` | **code 0**, seul `@learny/web` est construit |
| Couverture du contrat côté Python | `uv run pytest apps/api-py/tests/unit/test_route_coverage.py apps/api-py/tests/unit/test_contract_artifacts.py -q` | **16 passed in 5.96s** (2026-11-23) |
| Aucune assertion d'oracle modifiée | `git diff --stat chore/backend-100-python..HEAD -- apps/web/e2e` | **aucun fichier** : les suites e2e, visuelles et axe sont intactes |
| Parité disponible contre l'API Python | `pnpm parity:check --target http://127.0.0.1:3001` | non rejoué ici (exige une pile locale démarrée et un enregistrement à jour) |

**Non prouvé — raisons :**

- ❌ la campagne **e2e Playwright complète** (desktop, mobile, journeys, cross-browser Firefox/WebKit,
  vidéo) n'a pas été rejouée dans ce lot : elle exige la pile complète (Supabase, façade, worker,
  build du web) et une base réinitialisée, et elle n'entre pas dans le périmètre de documentation et
  d'outillage de ce lot.
- ❌ **axe** (aucune violation `serious`/`critical`) n'a pas été mesuré pour la même raison.
- ❌ les **oracles visuels** n'ont pas été comparés aux lignes de base.
- ❌ `pnpm run lint` échoue sur un point, hors zone de ce lot : `apps/web/playwright.config.ts:47`
  garde la constante `API_PORT` (port du serveur Hono retiré par L4). Le reste de la chaîne `lint`
  passe ; la correction (supprimer la constante et le commentaire « relays to Hono on PORT+12 »)
  revient au lot propriétaire de `apps/web/**`.

Aucune ligne de base n'a été régénérée (ET-2) : il n'y a donc pas de régression visuelle constatée,
mais pas de mesure non plus.

## CA-2 — `apps/api`, Inngest et les paquets backend retirés n'apparaissent plus dans le build ni le déploiement

**Prouvé.**

| Preuve | Commande | Résultat |
|---|---|---|
| Aucun chemin backend TypeScript | `node tools/migration/inventory.mjs --runtime` | `TypeScript backend paths remaining: 0 of 12` — `apps/api`, `apps/worker`, `api-routes`, `automations`, `http`, `ingestion`, `jobs`, `learning-engine`, `llm`, `notifications`, `services`, `tutor` absents |
| Frontière du web | `node tools/migration/report.mjs --check` | `imports non résolus 0` ; `fichiers route.ts sous apps/web 0` ; 8 paquets `@learny/*` importés, tous présents |
| Déploiement | `docker/compose.coolify.yml`, `docker/compose.coolify-py.yml`, `docker/compose.coolify-qa*.yml` | aucun service `api` ni `inngest` ; seuls `api-py` et `worker-py` portent le backend (plus `web`, `migrate`, Supabase) |
| CI | `.github/workflows/*.yml` | plus d'étape de build ni de déploiement de `apps/api`, plus de synchronisation Inngest (retirées par le lot L4) |
| Artefact OpenAPI mort | `git log -- packages/contracts/scripts/generate-openapi.ts` | supprimé ; `openapi:generate`/`openapi:check` retirés de `package.json` et `openapi:check` retiré de la chaîne `lint` |

## CA-3 — L'inventaire final montre 217 opérations, tous les événements et tâches servis par Python

**Prouvé pour la couverture, ❌ pour le nombre 217.**

| Preuve | Commande | Résultat |
|---|---|---|
| Couverture des opérations | `node tools/migration/inventory.mjs --runtime` | `156/156 operations served by Python (156 @handler, 11 installed by the special registry)` |
| Routes spéciales | idem | `11/11 special routes installed by Python` |
| Consommateurs | idem | `23 event consumers, all in learny_worker/consumers.py` |
| Crons | idem | `2 cron ticks, all in learny_worker/scheduler.py` (`cron/hourly-tick` 5 * * * *, `cron/nightly` 30 1 * * *) |
| Événements | idem | `15 consumed events, all declared in api/events.schema.json` |
| Dérive | `node tools/migration/inventory.mjs --check` | `Inventory up to date: 156 operations.` |
| Garde-fou d'exécution | `apps/api-py/tests/unit/test_route_coverage.py` | 16 tests verts : chaque opération a exactement un handler et une installation, aucune route spéciale en double, un handler orphelin échoue |
| Inventaire détaillé | `evidence/SPEC-2302/inventory.md` | table des 156 opérations avec handler et nombre de tests, des 11 routes spéciales, des 23 consommateurs et des 2 crons |

**Le chiffre 217 n'est pas le nombre d'opérations du contrat.** Il venait du comptage des
`defineRoute(` du registre TypeScript avant P23 ; les démonstrations `/_dev` ont été retirées par
ADR-2041 (`chore(sdd): retire les opérations dev de démonstration de l API`, commit `1e448e34`), et
`api/openapi.yaml` — l'artefact unique du contrat — porte **156 `operationId`** et 135 chemins. Le
critère est donc tenu dans son intention (toutes les opérations sont servies par Python) mais pas
dans son chiffre : il doit être corrigé par un ADR (ou une révision de la spec) avant la clôture.

## CA-4 — Chaque test TypeScript retiré a un équivalent pytest vert référencé

**Partiellement prouvé.**

| Preuve | Commande | Résultat |
|---|---|---|
| Plan de portage | `evidence/SPEC-2001/test-port-map.md` | 443 fichiers de test backend TypeScript, 2 942 cas, chacun avec son module pytest cible et sa spec porteur |
| Aucun test backend TypeScript restant | `node tools/migration/inventory.mjs --runtime` | `TypeScript backend paths remaining: 0 of 12` (dont `apps/api` et `apps/worker`, qui portaient leurs propres suites) |
| Suites Python présentes | `uv run pytest --collect-only -q` | **4561 tests collected in 8.42s** (`packages-py`, `apps/api-py`, `apps/worker-py`) — détail : `checks-pytest-collect.md` |
| Suites unitaires du contrat | `uv run pytest apps/api-py/tests/unit -q` | 16 tests verts ci-dessus |

**Non prouvé — raisons :**

- ❌ il n'existe **pas** de table consolidée « fichier TS retiré → fichier pytest vert » pour les 443
  lignes : le portage a été prouvé spec par spec (`evidence/SPEC-2201/` … `evidence/SPEC-2207/`
  contiennent chacun leur `test-port-map.md` partiel), et ce lot ne rejoue pas la suite pytest
  complète (elle exige la base Supabase locale et plusieurs minutes, hors de la fenêtre allouée).
- ❌ le statut `ported` n'a pas été reporté dans `evidence/SPEC-2001/test-port-map.md` (le fichier
  reste le **plan** historique, volontairement non réécrit : c'est une preuve datée de SPEC-2001).

## Ce qui reste à faire pour clore SPEC-2302

1. Rejouer et archiver la campagne complète : `pnpm test:e2e` (desktop, mobile, journeys),
   `pnpm test:e2e --project=cross-browser`, `pnpm test:visual`, axe inclus, avec vidéos et captures
   dans `evidence/SPEC-2302/`.
2. Rejouer `pnpm parity:record`/`--check` contre la pile locale et archiver l'enregistrement.
3. Sur le staging du porteur (ADR-2009) : charge k6, canary, rollback chronométré, restauration
   chronométrée — sinon `node tools/sdd/fail.mjs SPEC-2302 "staging indisponible" --external`.
4. Corriger le compteur 217 du CA-3 (ADR ou révision de la spec) et consolider la table de portage
   des 443 fichiers de test.
5. Alors seulement : `node tools/sdd/validate.mjs SPEC-2302` puis `complete.mjs SPEC-2302`.
