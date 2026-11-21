# 13 — ADR à rédiger après prototypes

Tous les éléments ici ont le statut **proposé**, pas accepté. Les ADR existants priment jusqu’à adoption formelle. ADR-1002 choisit Hono et apps/api TypeScript; un ADR Python devra le remplacer explicitement et expliquer le coût de réécriture. ADR-1001 exige parité fonctionnelle; ADR-1003 garde Next; ADR-1005 définit proxy/Auth; ADR-1006 gère la piste SDD; ADR-1007 contient les paquets partagés TS. ADR-0020/0021 imposent le déterminisme et l’exécution validée des actions.

| ADR candidat | Décision à consigner | Alternatives et preuves requises |
|---|---|---|
| ADR-PY-01 modular monolith Python | choisir Python et découpage modules; scope API/workers | garder TypeScript; coût compétences, livraisons et parité |
| ADR-PY-02 framework/runtime | FastAPI+Uvicorn provisoire | Litestar, Django Ninja, Granian, Hono baseline; POC identique |
| ADR-PY-03 contrat API | OpenAPI 3.1 auteur, SDK généré | schémas Pydantic source ou rester Zod source; drift et qualité clients |
| ADR-PY-04 persistance/RLS | SQLAlchemy/Psycopg/Alembic et claims transaction-local | psycopg sync, asyncpg, Supabase REST; POC RLS/pooler |
| ADR-PY-05 IdP et Storage | garder Supabase adapters | auth alternative; exigences portability/region/lock-in |
| ADR-PY-06 workflows/outbox | Inngest Python ou Temporal; event schema/version | Celery/Dramatiq/Taskiq/Arq; support tableau et recovery |
| ADR-PY-07 streaming IA | SSE protocol, retry/resume semantics, provider SDK ports | WebSocket ou provider SDK abstraction; e2e disconnect/cost |
| ADR-PY-08 AI boundaries | policies deterministes, tool registry, structured outputs | PydanticAI/LangGraph/non-agent; test remplaçabilité |
| ADR-PY-09 retrieval/index | pgvector hybrid search, embedding lifecycle | external vector store; recall, EU, cost, latency |
| ADR-PY-10 migration/cutover | one-writer domains and rollback | big-bang, Strangler routes, dual schema; drills |
| ADR-PY-11 security/scopes | cookie/Bearer/API keys/OIDC and MCP permissions | Supabase-only vs federated identity; threat model |
| ADR-PY-12 SLO/scale | thresholds, region, worker and DB budget | target measurable baseline; no active-user-based guess |

Chaque ADR doit contenir statut, contexte code spécifique, décision, options non retenues, conséquences positives/négatives, référence d’essai/benchmark ou gap, owner/date et conditions de réexamen. Les ADR non validés sont des recommandations et ne doivent pas devenir contraintes de specs.
