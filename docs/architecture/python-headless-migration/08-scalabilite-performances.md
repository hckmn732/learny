# 08 — Scalabilité et performances

## Charge à mesurer

La cible déclarée est 100k–500k utilisateurs actifs; elle ne définit ni simultanéité ni RPS. Collecter par marché/période: DAU/MAU, sessions simultanées p50/p95/max, API requests par route, lectures/écritures, connexions SSE, tokens LLM et taux d’appels par tâche, uploads/pages/mois, taille docs, chunks/embeddings, tailles DB/index, jobs en attente et âge du plus ancien. Préciser fuseaux horaires et scénarios de pointe (rentrée, certification, notifications).

Modèle à construire à partir des traces actuelles: arrivée par parcours, temps de résidence dans API/SSE, fanout job par commande, CPU extraction, latence provider, temps DB/lock, multiplicité des chunks, distribution d’organisation/utilisateur. Aucun chiffre de dimensionnement n’est établi par ce dossier.

## Architecture sous charge

- API sans état applicatif; session DB par transaction seulement.
- API, SSE, extraction/embedding, mail/push et cron séparés en process/containers.
- Limite de concurrence par provider/model, utilisateur et type job; backpressure avant saturation.
- Upload direct vers Storage avec URL courte quand contrat le permet; API enregistre ownership et événement.
- Pool DB budgété par instance: replicas × workers × pool_max inférieur au max DB moins Supabase services et accès admin. Mesurer pool wait, durée checkout et timeouts.
- Requêtes coûteuses indexées/EXPLAIN; cursor pagination; éviter N+1; charger projection adaptée.
- Redis non requis par défaut : rate limit et idempotence sont déjà DB-backed; ajouter cache seulement après mesure d’un hot read ou coordination non couverte.
- Kafka non recommandé : un outbox + Inngest/Temporal suffisent tant que le débit et le replay ne justifient pas un log distribué.
- DB read replicas, partitions, table archival ou vector split uniquement si saturation mesurée, limites RLS et besoins de cohérence compris.
- SSE consomme sockets longtemps; plafonner streams/actor, timeout, cancellation, keepalive et capacité proxy; les appels LLM sont gouvernés par limites distinctes.

## SLO proposés — hypothèses de départ

Les exigences produit actuelles incluent API p95 <300 ms hors IA (ADR-0041 / BR-PLA-07). Les valeurs supplémentaires sont des propositions à valider auprès du produit et exploitation.

| Mesure | Hypothèse initiale |
|---|---|
| Disponibilité API | 99.9% mensuel hors maintenance planifiée |
| Erreurs serveur | <0.1% 5xx mensuel; suivre 429 séparément |
| Latence API hors IA | p50 <100 ms, p95 <300 ms, p99 <750 ms |
| Débit soutenu | 2× pic observé/prévu pendant 60 min sans croissance de queue; chiffre RPS à calculer |
| Burst | 5× pic 1 min; admission control explicite et reprise sans perte |
| SSE | p95 premier token <2 s hors délai provider; durée, disconnect et complétion mesurés séparément |
| Job court | p95 complétion <60 s pour reminders/delivery; p95 délai queue <15 s |
| Job long | objectifs par type generation/ingest/export après baseline; pas un SLO générique |
| Recovery | redémarrage workers: aucun event perdu, reprise après 5 min; replay durable vérifié |
| DB | 5xx imputables DB <0.1%, pool wait p95 <50 ms sous cible |

SLO externes nécessitent budget erreur, pagination et latences des fournisseurs; ces seuils ne sont pas des garanties actuelles.

## Plan de benchmark reproductible

1. Capturer baseline Hono sur parcours simple authenticated read, mutation RLS/idempotency, SSE stream, upload/ingest, embeddings et outbox.
2. Rejouer avec même Postgres/Supabase schema, pooler, RLS, seed/anonymized distribution et provider mock/controlled-latency.
3. Candidats: FastAPI/Uvicorn, Litestar/Uvicorn; éventuellement Granian après profil initial.
4. Profiles normal (jour ordinaire), peak (p95 plausible), burst (5x arrivée), sustained (60 min), large payload, concurrence de même user/tenant et skew par gros utilisateurs.
5. Dimensions: 1/2/4/8 API workers; pool tailles 5/10/20; workers jobs séparés; SSE 100/500/1000 connections seulement dans environnement contrôlé.
6. Collecter p50/p95/p99, RPS, error/timeout, CPU/RAM, context switches, event loop lag, pool wait, lock conflicts, query latency, rows/vector recall, queue lag/throughput, stream disconnect et token/cost.
7. Test failover: kill API/worker après transaction avant publish, après provider call avant DB commit, pendant SSE et lors d’outbox retry. Vérifier idempotence/compensation.
8. Run ≥3 fois, préciser versions, dataset, topologie, config et erreur; garder résultats bruts et scripts dans evidence/benchmark; pas comparer chiffres de machines/protocoles différents.

Exit condition: aucun gain de throughput n’accepte régression sur 5xx, RLS, recall, coût, reprise ou SLO.

## Scalabilité AI

La limite économique est probablement fournisseur/quota et concurrence, pas ASGI. Budgets par utilisateur et provider, admission tokens et concurrent requests, queue prioritaire interactive vs batch, timeout/cancellation et circuit breaker. Journaliser modèle/provider/latence/tokens/cost estimate sans prompt PII. Une génération structurelle doit être vérifiée et versionnée; une relance LLM ne doit pas dupliquer records ou charges.
