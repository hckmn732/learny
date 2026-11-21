# 09 — Expérience développeur et organisation du monorepo

## État présent

Root package.json exige Node 24 et pnpm 10; pnpm-workspace inclut apps/* et packages/*; Turbo gère graphe et cache. Web et API ont leurs scripts dev/build/lint/typecheck. Aucun projet Python n’existe. Supabase local, Inngest dev server, Mailpit, Playwright, Vitest, Docker et SDD composent le démarrage.

## Structure cible

- apps/web: Next.js et pnpm, consommateur du contrat généré.
- apps/api: application ASGI.
- apps/worker: consumers workflow et schedules.
- python/pyproject.toml et python/uv.lock: autorité de l’environnement Python.
- python/apps/api, python/apps/worker, python/packages/domain, application, infrastructure.
- Modules Python restent packages internes si aucune version séparée n’est nécessaire.
- OpenAPI versionné et générateur TypeScript; pas de schémas TS/Pydantic entretenus à la main.
- Turbo peut orchestrer uv run, sans résoudre les dépendances Python.
- Outils SDD en JS peuvent rester à la racine s’ils ne dépendent pas du runtime applicatif.

## Commandes proposées

| Commande | Résultat |
|---|---|
| dev:web | Next seulement |
| dev:api | API ASGI/reload |
| dev:worker | worker et backend local de jobs |
| dev:all | web, API, worker et infrastructure locale |
| api:test | pytest ciblé |
| api:test:integration | pytest + Supabase local, DB verrouillée ou isolée |
| api:typecheck | BasedPyright |
| api:lint | Ruff |
| contracts:check | lint OpenAPI, breaking diff, génération TS propre |
| db:migrate:check | Alembic/check schema drift |
| test:e2e | Playwright web + API |

API mock ne requiert pas de credentials tiers. dev:api fonctionne sans pnpm. dev:all signale dépendances absentes et health.

## Réduction des temps d’itération

- uv sync depuis lockfile; extras séparés dev/api/worker.
- Tests par contexte et marker; DB isolée pour xdist.
- BasedPyright incrémental IDE, CI whole project.
- Ruff rapide et checks d’import; pre-commit sur fichiers modifiés.
- Image Docker layer cache d’abord lock, puis code; même wheel/lock API-worker.
- CI ciblée selon fichiers: contrats forcent web/API consumer tests; DB change force migrations/RLS integration.
- Publier durées cold/warm et cache hit ratio.

## Critère DX

Un développeur clone le dépôt, démarre API seule et passe unit/integration sans provider réel. Front-only work n’exige ni Python ni DB. Double génération du contrat ne crée aucun diff. Mesurer démarrage, test ciblé, typecheck, CI cache et image avant d’affirmer une accélération.
