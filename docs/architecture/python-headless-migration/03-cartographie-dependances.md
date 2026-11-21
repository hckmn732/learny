# 03 — Cartographie des dépendances et couplages

## Architecture observée

```mermaid
flowchart LR
  Browser[Navigateur / PWA] -->|/api/v1 same-origin| Next[apps/web Next proxy]
  SSR[Server Components / loaders] -->|api-client + cookie| Next
  Next -->|internal URL + secret proxy| API[apps/api Hono]
  Mobile[Futur client natif] -. futur Bearer .-> API
  API --> Http[packages/http] --> Routes[packages/api-routes]
  Routes --> Contracts[packages/contracts]
  Routes --> Services[packages/services]
  Services --> DB[packages/db / Postgres Supabase]
  Services --> Tutor[packages/tutor] --> LLM[packages/llm]
  Services --> Jobs[packages/jobs / Inngest]
  Jobs --> Services
  Jobs --> Notify[packages/notifications]
  Ingest[packages/ingestion] --> DB
  Ingest --> Embed[Voyage AI + pgvector]
  DB --> Outbox[event_outbox] --> Jobs
```

État code observé. La frontière d’application existe; le dépôt ne prouve pas encore les clients natifs ni l’indépendance de release du web.

## Couplages et recommandations

| Couplage | Emplacement/fait | Criticité | Risque | Découplage |
|---|---|---:|---|---|
| Navigateur → chemin/API et cookies | packages/api-client/src/client.ts: chemin /api/v1, same-origin | Moyenne | Le client doit connaître le transport web | OpenAPI public, URL/auth configurables, contrat stable |
| Next → backend | apps/web/proxy.ts; apps/web/lib/api/relay.ts | Élevée | API indisponible bloque relay; secret/forwarded headers confiance | Garder relay SSR temporaire, déplacer autorisation côté API |
| SSR → runtime Next | apps/web/lib/api/server-client.ts importe next/headers | Moyenne | loaders spécifiques Next; saut réseau | interface data côté web + client HTTP injectable |
| Proxy → logique produit/auth | apps/web/proxy.ts: session refresh, onboarding, garde formation | Élevée | source d’autorisation partagée entre frontend et backend | API devient source d’autorité; redirections restent UX |
| API → types/contracts TS | packages/http et api-routes dépendent contracts Zod | Élevée pour Python | contrat TypeScript ne s’importe pas en Python; OpenAPI omet certains events/SSE | OpenAPI versionné, génération TS, tests de compatibilité, contrat SSE documenté |
| Services → paquets transverses | packages/services/src, DB/LLM/jobs/domain | Élevée | graphe réel croisé, migration par paquet fragile | bounded contexts, ports, dépendances unidirectionnelles |
| Auth → Supabase | packages/http/src/session.ts et db client | Élevée | RLS suppose claims/rôles, cookie refresh côté client | identity adapter + claims dans transaction |
| DB → Supabase/Drizzle/postgres.js | packages/db/src/client.ts, migrations | Très élevée | RLS auth.uid(), fonctions, triggers, Storage non portés par ORM | garder SQL/RLS initialement; user UoW explicite |
| Jobs → Inngest TypeScript | packages/jobs/src/define.ts, emit.ts | Élevée | parité Python non totale, événement at-least-once | event schema versionné; conformité SDK; séparer consumers |
| Tutor → Vercel AI SDK | packages/llm/src, packages/tutor/src | Élevée | types/streaming/outils TS spécifiques | ports LLM indépendants, protocoles structurés |
| Ingestion → Voyage/extracteurs | packages/ingestion/src | Élevée | dimension, extraction et re-embeddings | version modèle/chunk; adapters; plan double index |
| API/Web release → secrets et versions | .github/workflows/deploy.yml, docker, .env.example | Élevée | drift API/web, rotation proxy, compatibilité contrat | release manifest N/N-1, rollback, health versionné |

## Flux d’une requête

```mermaid
sequenceDiagram
  participant U as Navigateur
  participant W as Next proxy / SSR
  participant A as Hono API
  participant H as HTTP policies
  participant S as Use case
  participant D as PostgreSQL
  U->>W: POST /api/v1 avec cookie ou Bearer
  W->>W: refresh session / guard / headers proxy
  W->>A: relai vers API_INTERNAL_URL
  A->>H: auth, validation, quota, idempotence
  H->>S: ActorContext + commande
  S->>D: transaction + RLS
  D-->>S: données autorisées
  S-->>A: DTO
  A-->>W: JSON ou problem+json
  W-->>U: réponse + requestId
```

La route formation peut être contrôlée dans le proxy puis réévaluée dans le service/RLS. Le premier contrôle décide un vrai 404 avant SSR streaming; le second reste la protection métier.

## Flux IA et outbox

```mermaid
sequenceDiagram
  participant API
  participant S as Service applicatif
  participant DB
  participant O as event_outbox
  participant I as Inngest
  participant J as Job
  participant T as Tutor / LLM
  API->>S: demande de génération
  S->>DB: état + événement dans transaction
  DB->>O: événement durable
  S-->>API: acceptation / état
  O->>I: dispatch après commit; tick rejoue pending
  I->>J: job avec steps idempotents
  J->>S: invoke service directement
  S->>T: tâche structurée
  T-->>S: résultat validé
  S->>DB: résultat + événements
```

Les retries et événements dupliqués font partie du modèle. L’appel IA est une opération externe non transactionnelle.

## Flux ingestion

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant F as Supabase Storage
  participant O as Outbox
  participant J as Job ingestion
  participant X as Extraction / chunk
  participant E as Embeddings
  participant V as pgvector
  C->>A: créer/finaliser ressource
  A->>F: fichier privé au chemin propriétaire
  A->>O: resource.uploaded
  O->>J: livraison durable
  J->>X: extraction par type
  X->>X: normalisation + segments + provenance
  X->>E: batches bornés, 1024 dimensions
  E-->>X: vecteurs
  X->>V: upsert idempotent et tenant-scoped
  J->>V: ready/failed + événement
```

Le pipeline doit conserver suppression concurrente, reprise et accès Storage. Un type dans un enum n’est pas preuve d’extracteur.
