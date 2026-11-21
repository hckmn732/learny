# 02 — Audit de l’état actuel

## Méthode et checkout

État source : branche main, commit 6881478a. Le relevé confronte le code, tests, scripts, documents normatifs et état SDD. Une spec ne prouve pas seule une implémentation; un fichier présent alors que le suivi SDD est pending n’est pas considéré comme livraison validée.

## Applications et packages

| Zone | Fonction, entrée et preuve |
|---|---|
| Web/PWA | Next.js 16, React 19, SSR, service worker Serwist, pages et client API — apps/web/package.json, apps/web/app, apps/web/proxy.ts |
| API | Hono 4 / Node 24; health, OpenAPI, CORS, routes, Inngest, webhook — apps/api/src/app.ts, server.ts, apps/api/api/index.ts |
| Contrats/client | ROUTES, schémas Zod, events, DTO, OpenAPI — packages/contracts/src, apps/api/openapi.json; transport Fetch — packages/api-client/src/client.ts |
| HTTP commun | handler, guards, auth, idempotence, rate limit, problem+json, logs — packages/http/src |
| Use cases | Services feature/domain — packages/services/src |
| Données | Drizzle, postgres.js, repositories, migrations et policies — packages/db/src, packages/db/migrations, supabase/migrations |
| Domaine pur | FSRS, maîtrise, lacunes, tirages, planning, streaks — packages/learning-engine/src |
| IA/tuteur | Providers et résolution — packages/llm/src; orchestration/outils — packages/tutor/src |
| Documents | extraction, segmentation, embeddings, recherche — packages/ingestion/src |
| Jobs | événements, fonctions, crons, outbox — packages/jobs/src |
| Notifications/automatismes | e-mail, push, in-app; moteur des dix automatismes — packages/notifications/src, packages/automations/src |
| UI/apprentissage | composants et 13 types de briques — packages/ui/src, packages/bricks/src |
| Outillage | pnpm/Turbo, Vitest, Supabase local, Playwright, SDD, Docker, CI — package.json, turbo.json, tools/sdd, docker, .github/workflows |

tools/migration/report.mjs --check rapporte 0 fichier web couplé par import direct, 219 routes au registre, 0 composant client couplé et 1 route.ts sous apps/web. Cela prouve la frontière d’import inspectée, pas l’absence de dépendance d’exécution au relais/session Next.

## Inventaire fonctionnel

| Fonction | Déclencheur et code | Données / dépendances | État prouvé par le code inspecté |
|---|---|---|---|
| Identité/onboarding | auth API, proxy session; services/auth | profiles, préférences; Supabase Auth | Présent; cookies web et Bearer |
| Formation/programme/groupes | cadrage et routes formation/programme | formations, modules, chapitres, notions, groupes; RLS | Présent; accès partagé asymétrique |
| Cours/progression | contributions → job generate-course → lecture | courses, sections, progress | Présent; LLM/jobs |
| Import de ressources | upload/note/URL/YouTube/image/PDF → resource.uploaded | resources, chunks, Storage | Traitement réel dans ingestion; voir caveat ci-dessous |
| Tutor | POST conversation/messages en SSE | conversations, actions, sources | Présent; protocole UI Vercel AI |
| Quiz/exercice/examen | attempts, submit, grading | bricks, answers, attempts, results | Présent; moteur déterministe pour items auto-corrigés, LLM pour réponses libres |
| Révision/lacunes | réponses quiz/révision, events | memory/notion_states/gaps | FSRS et calcul pur TS |
| Agenda/automatismes | mutations et ticks horaires/nocturnes | planning, règles et actions | Présent; horloge injectée et crons |
| Notifications | événements et schedules | notifications/settings/subscriptions | Présent; e-mail SMTP/Resend, Web Push, in-app |
| IA/BYOK | add/discover/qualify/select provider | ai credentials/usage/reservations | Présent; secret chiffré, modèle choisi par utilisateur |
| Facturation | Stripe checkout/portal/webhook | subscription et billing | Présent; accès application distinct des frais IA |
| Export/suppression | endpoint et job différé | exports, demandes de suppression, Storage | Présent; purge et rétention |
| Hors ligne | PWA pack, réponses en file et sync | reçus de synchronisation | Présent; serveur arbitre les conflits |
| SDD/demo | routes et pages gardées | état et jobs de démonstration | Présent, réservé au mode dev |

## Partiel, prévu, non démontré

Le pipeline packages/ingestion/src/process-resource.ts traite notes, web, YouTube, images et PDF; la présence de types audio/vidéo dans le modèle ou de SPEC-901/902 ne prouve pas le traitement end-to-end. Classer audio/vidéo comme prévu/partiel tant qu’un handler et ses tests réels n’ont pas été cartographiés.

Aucun apps/mobile n’est présent. MCP et clients tiers sont des objectifs futurs, pas des applications livrées. La cible 100k–500k actifs n’est couverte par aucun benchmark dans cet audit.

## Modèle et garanties

Les schémas Drizzle couvrent identité/préférences, formations et progression, ressources/chunks, cours/conversations, activités/tentatives, mémoire, planning, notifications, groupes, facturation IA, recherche/confidentialité et reçus offline. Voir packages/db/src/schema/{identity,formations,resources,courses,bricks-activities,memory,planning,notifications,groups,ai-billing,privacy-search}.ts.

packages/db/src/client.ts distingue userDb et serviceDb. userDb fixe les claims JWT et le rôle authenticated dans une transaction; serviceDb est privilégié et contourne RLS. Les migrations jusqu’à 0053 combinent schémas, fonctions, triggers, contraintes, indexes et policies. Les buckets resources/exports sont privés (0027_storage.sql). Les chunks utilisent pgvector dimension 1024. L’inventaire normatif se trouve dans packages/db/src/rls/matrix.ts.

## Jobs et IA

packages/jobs/src/functions/index.ts registre les fonctions, notamment génération de cours, ingestion, notification, questions, exports/suppression et crons. packages/jobs/src/emit.ts insère les événements transactionnellement dans event_outbox puis les distribue après commit et rejoue les pending. Le pipeline d’ingestion est dans packages/jobs/src/functions/ingest-resource.ts; les use cases sont exécutés directement.

packages/llm centralise providers, credentials, résolution par tâche, mocks et logs; packages/tutor orchestre tool calls validés. Ces interfaces sont conceptuellement transférables, mais le SDK Vercel AI et types TS ne le sont pas.

## Tests et prudence

Les tests existent dans packages/*, packages/db/test/integration, packages/services/test/integration, apps/api/test/integration et apps/web/e2e/specs. RLS, stockage, ingestion, recherche et données métier ont des cas d’intégration. Aucun test n’a été exécuté; présence et statut SDD ne sont pas synonymes de succès actuel.

## Index de preuves source (lignes du checkout audité)

- Entrée API et routes: apps/api/src/app.ts:48–107; apps/api/src/mount.ts:20–59; apps/api/src/server.ts:56–64; Vercel adapter apps/api/api/index.ts.
- Registre et couverture: packages/contracts/src/routes.ts (déclarations ROUTES); packages/api-routes/src/tables.ts:51–96; tools/migration/report.mjs --check (219 routes, compte de couplage).
- Wrapper HTTP: packages/http/src/route-handler.ts:42, 83–91, 107+, 191+, 225+, 287+; problème RFC9457 et request id également dans packages/http/src/handler.ts.
- Sessions: packages/http/src/session.ts:57–74, 80–159 (Supabase cookie/Bearer, JWT, vérification fraîche).
- Contexte service: packages/services/src/context.ts:6–56 (user-scoped db et contexte système).
- Pool/RLS: packages/db/src/client.ts:152–191, 206–249 (pool Drizzle, serviceDb, userDb claims et role); inventaire packages/db/src/rls/matrix.ts.
- Politiques PostgreSQL: packages/db/migrations/0026_rls_policies.sql:12–84 et 288; règles groupes packages/db/migrations/0025_groups_rules.sql.
- Outbox: packages/jobs/src/emit.ts:187+ et 230–275; table packages/db/migrations/0028_events.sql:1–23.
- Fonctions durables: packages/jobs/src/functions/index.ts:35–73; packages/jobs/src/define.ts:64–123; tick/outbox replay packages/jobs/src/functions/cron-hourly-tick.ts:21–41.
- Ingestion job: packages/jobs/src/functions/ingest-resource.ts:13–50; extract/chunk/write packages/ingestion/src/process-resource.ts:218–316, 329–428, 439–584, 628–685.
- Tutor SSE: packages/api-routes/src/implementations/tutor-chat.ts:19–31; conversation context packages/services/src/tutor-chat/.
- DB/vector schema: packages/db/src/schema/resources.ts:63–205; migration packages/db/migrations/0008_resources_chunks.sql:5–23; embedding packages/ingestion/src/embeddings.ts:15–149.
- Stockage: packages/db/migrations/0027_storage.sql:4–118; intégration packages/db/test/integration/storage.test.ts:196–456.
- Learning engine: packages/learning-engine/src/fsrs/review.ts:186–258; draw/draw-attempt.ts:620; gaps/detect.ts:648–776; planner/plan.ts:1124; frontières packages/learning-engine/test/integration/engine-boundaries.test.ts:20–56.
- Relais web et auth UI: apps/web/proxy.ts (API relay and guards); apps/web/lib/api/relay.ts:35–64; apps/web/lib/api/server-client.ts:10–48 (Next headers, cookie, forwarded secret).
- Workflows SDD: specs/catalog.json P10–P13; progress/state.json SPEC-1001..1302 and CP-8/10..13; docs/engineering/sdd-process.md §1 bis and docs/engineering/git.md §1.0.

Les numéros de ligne réfèrent au commit 6881478a et peuvent évoluer. Ils localisent le code à contrôler; ils ne prétendent pas qu’un test a été exécuté.


## Écart de couverture API

L’inventaire OpenAPI apps/api/openapi.json contient 217 opérations HTTP; tools/migration/report.mjs --check compte 219 routes au registre. L’écart de deux opérations est non résolu. Rapprocher l’OpenAPI, les routes spéciales/streams, ROUTE_IMPLEMENTATIONS et SPECIAL_HANDLERS avant de déclarer le contrat exhaustif. Voir [Annexe 02b](02b-inventaire-api-openapi.md), qui liste les opérations avec chemin, méthode, operationId et résumé.
