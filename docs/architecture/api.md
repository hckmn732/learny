# API v1 — conventions et inventaire

Normatif. Implémenté par SPEC-201 (socle) puis par chaque spécification fonctionnelle. Les schémas d'entrée/sortie vivent dans `packages/contracts/src/<domaine>.ts` ; un document OpenAPI 3.1 est généré dans `apps/web/public/openapi.json` (SPEC-201).

## 1. Conventions

- Base : `/api/v1`. JSON UTF-8. Noms de champs en `camelCase`. Dates : ISO 8601 avec fuseau (`2026-11-11T13:20:00+01:00`) ; dates civiles `YYYY-MM-DD`.
- Authentification : cookie de session Supabase (`@supabase/ssr`) ; toute route exige un utilisateur sauf `/health`, `/auth/*`, `/legal/*`, `/webhooks/*`, `/invitations/:code` (lecture publique minimale).
- Wrapper unique `handler({ auth, input, output, rateLimit, idempotent }, fn)` dans `apps/web/lib/api/handler.ts` : vérifie la session, valide `params`, `query`, `body` avec Zod, applique la limitation de débit, l'idempotence (en-tête `Idempotency-Key` obligatoire sur les POST qui créent), journalise avec `requestId`, convertit les erreurs.
- Erreurs : `application/problem+json` (RFC 9457) : `{ type, title, status, detail, code, requestId, errors? }`. Codes métier (`code`) en `SCREAMING_SNAKE_CASE`, catalogue dans `packages/core/src/errors.ts` (ex. `FORMATION_LIMIT_REACHED`, `MODULE_LOCKED`, `AI_UNAVAILABLE`, `AI_CAP_REACHED`, `RETRY_NOT_YET_ALLOWED`, `UPLOAD_TOO_LARGE`, `UNSUPPORTED_TYPE`, `QUOTA_EXCEEDED`, `UPLOAD_INCOMPLETE`, `ALREADY_SUBSCRIBED`, `INVALID_SIGNATURE`, `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED`, `CONFLICT`).
- Pagination : `?cursor=&limit=` (défaut 20, max 100) → `{ items, nextCursor }`.
- Codes HTTP : 200 lecture/mise à jour, 201 création, 202 traitement asynchrone lancé (`{ jobId }`), 204 suppression, 400 validation, 401, 403, 404, 409 conflit, 422 règle métier, 429 limitation, 500.
- Limitation de débit par défaut : 120 requêtes/min/utilisateur ; routes IA (`/tutor/*`, génération) : 20/min ; auth : 10/min/IP.
- Les routes ne contiennent aucune logique métier : elles appellent `packages/services`.
- Exception documentée (SPEC-206, ADR-0255) : `POST /chapters/:cid/uploads` exige l'en-tête `Idempotency-Key` mais l'idempotence est portée par le service, pas par le wrapper, car la réponse contient une URL signée qui ne doit jamais être stockée (la même clé renvoie la même ressource avec une URL fraîche).
- Abonnement (SPEC-210, ADR-0215, ADR-0261) : `POST /billing/checkout` renvoie `{ url }` (`successPath` et `cancelPath` sont des chemins internes, `//` et URL absolues refusés, `409 ALREADY_SUBSCRIBED` pour un abonnement `active`, idempotent par `Idempotency-Key`) ; `GET /billing/subscription` renvoie `{ status, currentPeriodEnd, hasManagedAi, dailyCapUsd }`. `POST /webhooks/stripe` est public mais authentifié par la signature `Stripe-Signature` du **corps brut** (tolérance 300 s, `400 INVALID_SIGNATURE` sinon) : il répond toujours `200 { received, result }` pour un événement vérifié (`applied`, `duplicate`, `stale`, `ignored`, `unknown_customer`). Il vit sous `/webhooks/*`, exempté de la garde d'origine. En `STRIPE_MODE=mock`, `/api/v1/dev/sdd/stripe/*` et `/_dev/stripe/{checkout,portal}` simulent le parcours (`ENABLE_SDD_PAGES` seulement).

## 2. Inventaire des routes

| Méthode et chemin | Rôle | Spécification |
|---|---|---|
| GET `/health` | Santé (base, version) | SPEC-006, 010 |
| POST `/auth/magic-link` · POST `/auth/sign-up` · POST `/auth/sign-in` · POST `/auth/resend` · POST `/auth/sign-out` · GET `/auth/callback` | Authentification | SPEC-202 |
| GET/PATCH `/me` · GET/PATCH `/me/preferences` · PATCH `/me/onboarding` | Profil, rythme, onboarding | SPEC-602, 707 |
| GET/PATCH `/me/notification-settings` · POST/DELETE `/me/push-subscriptions` | Notifications | SPEC-205, 708 |
| GET/PATCH `/me/automations` · GET `/me/automation-actions` · POST `/me/automation-actions/:id/(accept|decline|undo)` | Automatismes | SPEC-711, 710 |
| POST/GET/DELETE `/me/pause` | Mode pause | SPEC-721 |
| POST `/me/export` · GET `/me/exports/:id` · POST `/me/deletion` · DELETE `/me/deletion` | Données personnelles | SPEC-211 |
| GET/PUT `/me/ai/task-models` · GET/POST/DELETE `/me/ai/credentials` · POST `/me/ai/credentials/:id/qualify` · GET `/me/ai/usage` | Modèles d'IA | SPEC-505, 506, 507, 709 |
| POST `/billing/checkout` · POST `/billing/portal` · GET `/billing/subscription` · POST `/webhooks/stripe` | Abonnement | SPEC-210, 725 |
| GET `/home` | Données de l'accueil | SPEC-603 |
| GET `/formations` · POST `/formations` · GET/PATCH `/formations/:fid` · POST `/formations/:fid/(pause|resume|archive|open)` | Formations | SPEC-604, 618 |
| GET/POST `/formations/:fid/cadrage/messages` · POST `/formations/:fid/cadrage/complete` | Cadrage | SPEC-604 |
| POST `/formations/:fid/programme/generate` · POST `/formations/:fid/programme/import` · POST `/formations/:fid/programme/adjust` · POST `/formations/:fid/programme/validate` · GET `/formations/:fid/programme` | Programme | SPEC-605, 606 |
| GET `/formations/:fid/modules/:mid` · PATCH `/chapters/:cid/progress` | Module, statut des chapitres | SPEC-607 |
| POST `/chapters/:cid/resources` (note, url) · POST `/chapters/:cid/uploads` (URL d'envoi signée) · POST `/resources/:rid/finalize` · GET `/resources/:rid/url` (URL de lecture signée) · PATCH/DELETE `/resources/:rid` · POST `/resources/:rid/retry` · POST `/resources/:rid/(import|dismiss)` | Apports | SPEC-607, 206 |
| POST `/modules/:mid/course/generate` · GET `/modules/:mid/course` · PATCH `/course-sections/:sid` · POST `/course-sections/:sid/report` · PUT `/courses/:cid/progress` · POST `/chapters/:cid/summary` | Cours | SPEC-608, 609 |
| POST `/courses/:cid/conversations` · GET `/conversations/:id` · POST `/conversations/:id/messages` (flux SSE) · POST `/conversations/:id/self-test/answer` · POST `/tutor/cards` | Discussion tuteur | SPEC-610, 717 |
| POST `/modules/:mid/quiz/attempts` · GET `/attempts/:aid` · PUT `/attempts/:aid/answers/:pos` · POST `/attempts/:aid/answers/:pos/check` · POST `/attempts/:aid/submit` · GET `/attempts/:aid/result` | Quiz, examen, exercice | SPEC-611, 613, 614 |
| GET `/modules/:mid/remediation` · POST `/modules/:mid/remediation/complete` | Remédiation | SPEC-612 |
| POST `/modules/:mid/exercises/:aid/hint` | Indices d'exercice | SPEC-613 |
| POST `/formations/:fid/mock-exams` · PATCH `/formations/:fid/exam-format` | Examen blanc | SPEC-614 |
| GET `/formations/:fid/global-quiz/today?mode=full|micro` · POST `/review-sessions/:sid/answers` · POST `/review-sessions/:sid/complete` · POST `/sync/offline-answers` | Quiz global, hors ligne | SPEC-701, 703, 801 |
| GET `/formations/:fid/gaps?nature=` | Mes lacunes | SPEC-615 |
| GET `/formations/:fid/notion-graph` | Carte des notions | SPEC-616 |
| GET `/agenda?from=&to=&formation=` · POST `/slots/:id/move` · GET `/slots/:id/alternatives` · POST `/formations/:fid/replan-options` · POST `/formations/:fid/replan` | Agenda | SPEC-704, 705 |
| GET `/notifications?filter=` · POST `/notifications/:id/read` · POST `/notifications/read-all` · GET `/notifications/unread-count` | Notifications | SPEC-706 |
| GET `/search?q=` | Recherche globale | SPEC-212, 307 |
| GET `/formations/:fid/final-review` · POST `/formations/:fid/maintenance` | Bilan final | SPEC-617 |
| POST `/formations/:fid/group` · GET `/formations/:fid/group` · POST `/groups/:gid/rotate-code` · DELETE `/groups/:gid/members/:uid` · GET `/invitations/:code` · POST `/invitations/:code/accept` · POST `/groups/:gid/leave` | Formations à plusieurs | SPEC-724 |
| GET `/streak` · GET `/milestones` | Série et jalons | SPEC-723 |
| POST `/bricks/:bid/report` · PATCH `/bricks/:bid` (correction apprenant) | Signalement / correction | SPEC-609, 501 |
| `/api/inngest` | Point d'entrée des jobs | SPEC-203 |
| POST `/dev/sdd/events/demo` (idempotent, 202 `{ jobId }`) · GET `/dev/sdd/events/demo/:runId` · GET `/dev/sdd/events/outbox` · POST `/dev/sdd/cron/hourly-tick` | Démonstration des événements, des jobs et du tick horaire (`ENABLE_SDD_PAGES` seulement, jamais en production) | SPEC-203 |
| POST `/dev/sdd/push/send` (201, notification de démonstration envoyée par le canal push simulé) | Démonstration des notifications navigateur (`ENABLE_SDD_PAGES` seulement, jamais en production) | SPEC-205 |

Toute route ajoutée par une spécification doit être ajoutée à ce tableau dans le même commit.
