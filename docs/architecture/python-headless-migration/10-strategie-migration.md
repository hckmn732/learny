# 10 — Stratégie de migration

## Conserver, porter ou repenser

| Sujet | Proposition | Condition |
|---|---|---|
| UUID et PostgreSQL | conserver au départ | aucune export/import initiale |
| Schéma, RLS, contraintes, fonctions SQL | conserver et inventorier | parité des garanties |
| Supabase Auth/Storage | conserver derrière adapters | claims, cookies/Bearer, ACL vérifiés |
| REST | mêmes comportements v1 | OpenAPI diff sans rupture |
| Services TypeScript | porter en use cases par domaine | pas traduction fichier par fichier |
| Learning engine | fonctions pures en Python | oracle TypeScript et property tests |
| Jobs | migrer consumers après application | mêmes events/version, outbox et idempotence |
| Vercel AI SDK | remplacer par ports + SDKs officiels | mêmes capacités, budgets, logs, streaming |
| Frontend | conserver Next | proxy déplacé seulement API/auth prêtes |
| Infrastructure | conserver Vercel/Supabase/Inngest d’abord | changement seulement sur mesure |
| Worker TS | retirer après cutover fonctions | parité + replay vérifiés |

## Données et cutover

1. Baseline dump/schema hash; inventaire tables, views, functions, triggers, extensions, RLS, Storage policies.
2. Python lit/écrit même schéma via transactions avec actor claims; DB unique source.
3. Changements expand-contract; migrations appliquées par job singleton.
4. Route/domain switch explicite via proxy/gateway; jamais deux writers même dataset.
5. Shadow reads comparent réponses/projections sans mutations doubles; écarts anonymisés.
6. Embeddings existants gardés avec model/dimension; nouveau modèle dans colonne/index versionné, re-embed progressif, switch après recall tests.
7. Storage garde les mêmes owner-scoped paths et signed URLs.
8. Rollback vers TS tant que schéma et events compatibles. Sinon prévoir migration inverse testée ou forward fix; ne pas supposer rollback.
9. Export/suppression couvre DB, fichiers, chunks, credentials, histories et rétention GDPR.

## Phases

| Phase | But/livrable | Dépendance | Critère de sortie |
|---|---|---|---|
| M0 Inventaire | route/job/event/data matrix | audit | chaque 219 route a actor, I/O/errors, services/tables/tests/status |
| M1 Contrats | OpenAPI, event JSON schema, errors, SSE spec, SDK TS | M0 | génération stable, consumer tests, breaking diff identifié |
| M2 Socle | uv, config, logs, traces, app factory, health | M1 | startup sans tiers, lint/typecheck/unit |
| M3 DB/Auth | SQLAlchemy/Psycopg UoW + Supabase Auth adapter | M2 | RLS matrix rerun sous acteurs, transaction rollback et idempotence |
| M4 Formation | identity, cadrage, programme | M3 | API parity, event parity, web behavior |
| M5 Apprentissage | quiz, FSRS, gaps, planning | M4 | oracle fixtures/property compare avec TS |
| M6 Tutor/Content | SSE, LLM adapters, ingestion/RAG | M3/M5 | stream parity, budgets, SSRF/storage, retrieval recall |
| M7 Workflows | outbox, jobs, reminders, privacy | M4–M6 | restart/retry/duplicate, export/deletion and deliver |
| M8 Coexistence | canary, metrics, rollback | M4–M7 | single writer, no event/data loss, rollback rehearsal |
| M9 Retirement | enlever backend TS et exploitation finale | M8 | aucune route/job TS en production; SLO/parity/gates verts |

## Coexistence

Chaque route a un owner de runtime unique. Consumers peuvent coexister sur events versionnés, mais un event ne déclenche pas les deux mutations. Event outbox dans transaction, stable idempotency key. Canaries commencent en lecture; toute mutation a attribution et rollback documentés. Parité inclut données, logs, erreurs, messages SSE, sécurité, performances et coût. La migration ne finit qu’au retrait démontré du backend TS.
