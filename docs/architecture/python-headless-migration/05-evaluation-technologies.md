# 05 — Évaluation des technologies

Évaluation qualitative ciblée sur Learny; aucune performance mesurée ici. Le framework, le serveur et le code applicatif sont des couches distinctes.

## Framework API

| Critère | FastAPI | Litestar | Django Ninja |
|---|---|---|---|
| Écosystème | très large et établi | moderne, plus petit | écosystème Django mature |
| Typage | Pydantic, annotations, JSON Schema | Pydantic, dataclasses, TypedDict, msgspec | annotations et schémas Pydantic |
| DI | intégrée; attention à ne pas y déplacer les use cases | DI native avec scopes | intégration auth/Django, plus de cycle Django |
| OpenAPI | génération et docs automatiques | OpenAPI 3.1 natif | génération/export |
| Async | ASGI; valider middleware, clients et SSE | ASGI; valider streaming E2E | async views, ORM Django avec limites spécifiques |
| Tests | ASGI et vaste intégration tierce | bon outillage, moins d’adoptions | excellente base de tests Django |
| Recommandation | premier choix provisoire, API REST et grand vivier | candidat sérieux pour POC | non retenu sans usage de Django ORM/admin |

L’architecture applicative doit précéder le choix de framework. Comparer FastAPI/Litestar avec même routes, auth, OpenAPI, RLS, SSE et observabilité. Pas de hello-world benchmark. Django Ninja devient intéressant si Django lui-même est souhaité.

## Runtime et serveur

| Serveur | Usage | Réserve |
|---|---|---|
| Uvicorn | recommandation initiale, courant ASGI, options workers/limites | config proxy trust, graceful shutdown, pool global et mémoire à dimensionner |
| Granian | candidat de benchmark, implémentation Rust | gain réel sur application complète et maturité de build/monitoring à mesurer |
| Hypercorn | si besoin démontré HTTP/2 ou WebSockets | ajouter protocole et ops seulement si besoin; SSE existe déjà |

Tests en TLS/proxy, streaming, corps fichiers, observabilité, arrêt gracieux. Un serveur ne remplace pas le framework ni l’optimisation SQL.

## Persistance

SQLAlchemy 2 + Alembic + Psycopg 3 est recommandé à l’essai. Choisir async si les appels I/O concurrents le justifient; une AsyncSession par tâche et un UoW par transaction. Pool borné par instance/rôle et budget total adapté aux limites PostgreSQL/Supabase. Ne jamais créer un pool par requête.

Reproduire dans la transaction les claims JWT et le rôle nécessaires à auth.uid() et RLS. Tester chaque policy sous les rôles réels. Conserver migrations SQL, contraintes, triggers, fonctions et indexes; une traduction ORM ne suffit pas. Vérifier session state, statements préparés, SET LOCAL, advisory locks et LISTEN/NOTIFY avec le pooler transaction-mode.

PostgreSQL demeure le système d’autorité, Supabase Auth/Storage des adapters. pgvector-python supporte SQLAlchemy et Psycopg. Garder la dimension d’embedding 1024 au début.

## Jobs/workflows

| Option | Atouts | Limites |
|---|---|---|
| Inngest Python | limite changement de plateforme; durable steps, events, cron, retries | SDK Python n’a pas parité TS pour plusieurs features, notamment wait-for-signal, step.fetch, checkpoints par défaut et quelques realtime APIs |
| Temporal | workflows reprenables, timers/signals, activités réessayables, historique | plateforme supplémentaire, modèle déterministe et versionnage à apprendre |
| Celery | très mature, brokers variés, retry et scheduling établis | broker/result store; outbox/DLQ/idempotence et durabilité métier à intégrer |
| Dramatiq | tâches simples et retries lisibles | orchestration longue plus légère |
| Taskiq | approche async, plugins brokers et scheduler | maturité et production à valider |
| Arq | async/Redis simple | surface étroite et Redis imposé sans besoin établi |

Garder Inngest pour un prototype Python uniquement si une checklist de conformité passe: step durable, sleep_until, wait event, annulation, retry, idempotence, test local, replay après arrêt, observabilité, failure handler. Temporal devient la préférence si workflows durables multi-étapes et signaux sont incontournables.

## IA et documents

Créer des Protocols internes ChatModel, StructuredOutput, ToolExecutor, Embedder, SearchProvider. Utiliser les SDK officiels pour le spécifique fournisseur; valider tout JSON avec un schéma. Aucune règle d’accès, FSRS, quota ni écriture métier n’est déléguée au modèle. Framework d’agent remplaçable.

RAG conserve FTS + pgvector, chunks avec provenance et version embedding/chunker. Reranking seulement si une mesure de précision le justifie. Évaluer les parseurs Python par type; isoler les fichiers non fiables en CPU/mémoire et contrer SSRF.

## Outils

uv workspace/uv.lock; Ruff lint/format; BasedPyright strict; pytest et xdist lorsque les tests sont isolés; coverage par paquet; pre-commit; OpenTelemetry pour API→jobs→DB/LLM; Sentry avec redaction. pnpm garde le front, uv le backend Python, Turbo seulement orchestration racine.

Mesurer démarrage, test ciblé, typecheck, CI froide/chaude, build image, cache hit ratio avant d’affirmer que le DX s’accélère.

## Sources officielles consultées

- [FastAPI features](https://fastapi.tiangolo.com/features/) · [async](https://fastapi.tiangolo.com/async/)
- [Litestar](https://docs.litestar.dev/) · [DI](https://docs.litestar.dev/main/usage/dependency-injection.html)
- [Django Ninja OpenAPI](https://django-ninja.dev/guide/openapi/) · [async](https://django-ninja.dev/guide/async/)
- [Uvicorn settings](https://uvicorn.dev/settings/) · [deployment](https://uvicorn.dev/deployment/)
- [Hypercorn](https://hypercorn.readthedocs.io/en/stable/)
- [SQLAlchemy async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html) · [pool](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/) · [lock](https://docs.astral.sh/uv/concepts/projects/sync/) · [Ruff](https://docs.astral.sh/ruff/formatter/)
- [Inngest Python](https://www.inngest.com/docs/reference/python) · [feature matrix](https://www.inngest.com/docs/sdks)
- [Temporal Python](https://docs.temporal.io/develop/python) · [activities](https://docs.temporal.io/activities)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [pgvector Python](https://github.com/pgvector/pgvector-python)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) · [Responses](https://platform.openai.com/docs/api-reference/responses)
