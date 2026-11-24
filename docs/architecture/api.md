# API v1 — conventions et inventaire

Normatif. Implémenté par SPEC-201 (socle) puis par chaque spécification fonctionnelle. Les schémas d'entrée/sortie vivent dans `packages/contracts/src/<domaine>.ts` ; le document OpenAPI 3.1 est exporté dans `api/openapi.yaml` (`pnpm contract:export`, ADR-2004) ; ce fichier est la source de la table de routes Python, des modèles Pydantic et du SDK (ADR-2012). Aucune application ne sert plus de document OpenAPI : le contrat est un artefact du dépôt.

> **Séparation backend / frontend (ADR-1001, ADR-1005, ADR-2043).**
> `apps/api` est l'unique serveur HTTP : la façade FastAPI sert les 156 opérations du contrat et
> les 11 routes spéciales. Le pipeline générique (identifiant de requête, origine, limite,
> idempotence, authentification, validation, CGU, validation de sortie) vit dans
> `learny_api/pipeline.py` ; les adaptateurs minces sont les `@handler("<route id>")` de
> `learny_api/handlers/*`, qui appellent le `public.py` de leur contexte Python. Le web relaie la
> même origine vers cette façade. Aucun autre emplacement n'héberge une route HTTP de production.

## 1. Conventions

- Base : `/api/v1`. JSON UTF-8. Noms de champs en `camelCase`. Dates : ISO 8601 avec fuseau (`2026-11-11T13:20:00+01:00`) ; dates civiles `YYYY-MM-DD`.
- Authentification : cookie de session Supabase (`@supabase/ssr`) ou `Authorization: Bearer` pour les clients natifs ; le Bearer est prioritaire et vérifié localement (JWKS mis en cache dix minutes, repli HS256 avec `SUPABASE_JWT_SECRET`). Les routes sensibles portent `freshAuth` et revérifient l'état du compte auprès d'Auth. Toute route exige un utilisateur sauf `/health`, `/auth/*`, `/legal/*`, `/webhooks/*`, `/invitations/:code` (lecture publique minimale).
- Wrapper unique `handler({ auth, input, output, rateLimit, idempotent }, fn)` dans `@learny/http` : vérifie la session, valide `params`, `query`, `body` avec Zod, applique la limitation de débit, l'idempotence (en-tête `Idempotency-Key` obligatoire sur les POST qui créent), journalise avec `requestId`, convertit les erreurs.
- Erreurs : `application/problem+json` (RFC 9457) : `{ type, title, status, detail, code, requestId, errors? }`. Codes métier (`code`) en `SCREAMING_SNAKE_CASE`, catalogue dans `packages/core/src/errors.ts` (ex. `FORMATION_LIMIT_REACHED`, `MODULE_LOCKED`, `AI_UNAVAILABLE`, `AI_CAP_REACHED`, `RETRY_NOT_YET_ALLOWED`, `UPLOAD_TOO_LARGE`, `UNSUPPORTED_TYPE`, `QUOTA_EXCEEDED`, `UPLOAD_INCOMPLETE`, `ALREADY_SUBSCRIBED`, `INVALID_SIGNATURE`, `SESSION_CLOSED`, `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED`, `CONFLICT`).
- Pagination : `?cursor=&limit=` (défaut 20, max 100) → `{ items, nextCursor }`.
- Codes HTTP : 200 lecture/mise à jour, 201 création, 202 traitement asynchrone lancé (`{ jobId }`), 204 suppression, 400 validation, 401, 403, 404, 409 conflit, 422 règle métier, 429 limitation, 500.
- Limitation de débit par défaut : 120 requêtes/min/utilisateur ; routes IA (`/tutor/*`, génération) : 20/min ; auth : 10/min/IP.
- Les routes ne contiennent aucune logique métier : une entrée `defineRoute` est déclarée dans
  `packages/contracts`, exportée dans `api/openapi.yaml`, puis servie par un `@handler` de
  `apps/api` qui délègue au cas d'usage du contexte Python.
- `apps/web/proxy.ts` relaie `/api/*` et `/openapi.json` vers `API_INTERNAL_URL` sur la même origine. Il remplace tout secret de proxy entrant, transmet `X-Learny-Proxy-Secret`, `X-Forwarded-Host`, `X-Forwarded-Proto` et `X-Forwarded-For`, préserve les flux SSE, cookies et corps bruts. La façade Python identifie ses réponses par `X-Served-By: learny-api`.
- la façade accepte le secret courant `API_PROXY_SECRET` et, pendant une rotation uniquement,
  `API_PROXY_SECRET_PREVIOUS`. `apps/web` ne lit et n'envoie que le secret courant. Les deux
  valeurs sont comparées en temps constant.
- Si la façade est indisponible, le relai répond `502` `application/problem+json` avec le code `API_UNAVAILABLE` sans empêcher le rendu des pages web.
- Exception documentée (SPEC-206, ADR-0255) : `POST /chapters/:cid/uploads` exige l'en-tête `Idempotency-Key` mais l'idempotence est portée par le service, pas par le wrapper, car la réponse contient une URL signée qui ne doit jamais être stockée (la même clé renvoie la même ressource avec une URL fraîche).
- Abonnement (SPEC-210, ADR-0215, ADR-0261) : `POST /billing/checkout` renvoie `{ url }` (`successPath` et `cancelPath` sont des chemins internes, `//` et URL absolues refusés, `409 ALREADY_SUBSCRIBED` pour un abonnement `active`, idempotent par `Idempotency-Key`) ; `GET /billing/subscription` renvoie `{ status, currentPeriodEnd }` (droit d'usage gratuit par défaut : `status: 'none'`, ADR-0340). `POST /webhooks/stripe` est public mais authentifié par la signature `Stripe-Signature` du **corps brut** (tolérance 300 s, `400 INVALID_SIGNATURE` sinon) : il répond toujours `200 { received, result }` pour un événement vérifié (`applied`, `duplicate`, `stale`, `ignored`, `unknown_customer`). Il vit sous `/webhooks/*`, exempté de la garde d'origine. En `STRIPE_MODE=mock`, `/api/v1/dev/sdd/stripe/*` et `/_dev/stripe/{checkout,portal}` simulent le parcours (`ENABLE_SDD_PAGES` seulement).

## 2. Inventaire des routes

| Méthode et chemin | Rôle | Spécification |
|---|---|---|
| GET `/health` | Santé (base, version) | SPEC-006, 010 |
| POST `/auth/magic-link` · POST `/auth/sign-up` · POST `/auth/sign-in` · POST `/auth/resend` · POST `/auth/sign-out` · GET `/auth/callback` | Authentification | SPEC-202 |
| GET/PATCH `/me` · GET/PATCH `/me/preferences` · GET/PATCH `/me/onboarding` | Profil, rythme et état complet des écrans d’onboarding | SPEC-602, 707, 1202 |
| GET/PATCH `/me/notification-settings` · POST/DELETE `/me/push-subscriptions` (Web Push et jetons natifs APNs/FCM) | Notifications | SPEC-205, 708, 3501 |
| GET/PATCH `/me/automations` · GET `/me/automation-actions` · POST `/me/automation-actions/:id/(accept|decline|undo)` | Automatismes | SPEC-711, 710 |
| GET `/warmups/today` · POST `/warmups/:activityId/answers` | Échauffement : une entrée par formation triée par heure de séance ; réponse de première passe idempotente par position (409 sur une position déjà répondue, 422 hors bornes), FSRS et quiz global du soir dans la même transaction | SPEC-714 |
| POST/GET/DELETE `/me/pause` · POST `/me/pause/diagnostic` | Mode pause, reprise et diagnostic de retour | SPEC-721 |
| POST `/me/export` · GET `/me/exports/:id` · POST `/me/deletion` · DELETE `/me/deletion` | Données personnelles | SPEC-211 |
| POST `/me/legal-acceptances` | Acceptation des versions actives des CGU et de la confidentialité ; deux lignes `legal_acceptances` atomiques et idempotentes, 409 `CONFLICT` si une version n’est plus active, 422 `LEGAL_ACCEPTANCE_REQUIRED` sur les mutations qui exigent une nouvelle acceptation | SPEC-806 |
| GET/PATCH `/me/profile` | État de l'écran Paramètres et enregistrement transactionnel du profil et du rythme, avec version attendue (`409 CONFLICT`) ; l'e-mail du profil n'est pas modifiable en V1 | SPEC-707 |
| GET/PUT `/me/ai/task-models` · GET/POST/DELETE `/me/ai/credentials` · POST `/me/ai/credentials/:id/qualify` · GET `/me/ai/usage` | Modèles d'IA. Clés personnelles (SPEC-505) : POST 201 DTO masqué (`keyMasked`, `outsideEu`, `dataNote`), GET 200 `{ items }` (10 au plus), DELETE 204 ; 404 pour la clé d'autrui, 409 `CONFLICT` pour un doublon exact, 422 `VALIDATION_FAILED`, `LOCAL_MODELS_DISABLED`, `CREDENTIAL_LIMIT_REACHED`, `URL_INVALID`, `URL_BLOCKED_HOST` ; aucune réponse ne contient `apiKey` ni `encryptedKey` | SPEC-505, 506, 507, 709 |
| POST `/billing/checkout` · POST `/billing/portal` · GET `/billing/subscription` · POST `/webhooks/stripe` | Abonnement | SPEC-210, 725 |
| GET `/home` | Données de l'accueil | SPEC-603 |
| GET `/formations` · POST `/formations` · GET/PATCH `/formations/:fid` · GET `/formations/:fid/access` · POST `/formations/:fid/(pause|resume|archive|open)` · PATCH `/me/current-formation` | Formations ; l’accès interne répond 204 ou 404 avant le rendu et n’est pas limité | SPEC-604, 615, 618, 1202 |
| GET `/formations/:fid/cadrage` · GET/POST `/formations/:fid/cadrage/messages` · POST `/formations/:fid/cadrage/complete` | Cadrage et DTO de page | SPEC-604, 1202 |
| POST `/formations/:fid/programme/generate` · POST `/formations/:fid/programme/import` · POST `/formations/:fid/programme/adjust` · POST `/formations/:fid/programme/validate` · GET `/formations/:fid/programme` | Programme | SPEC-605, 606 |
| GET `/formations/:fid/modules/:mid` · PATCH `/chapters/:cid/progress` | Module, statut des chapitres | SPEC-607 |
| POST `/chapters/:cid/resources` (note, url) · POST `/chapters/:cid/uploads` (URL d'envoi signée) · POST `/resources/:rid/finalize` · GET `/resources/:rid/url` (URL de lecture signée) · PATCH/DELETE `/resources/:rid` · POST `/resources/:rid/retry` · POST `/resources/:rid/(import|dismiss)` | Apports | SPEC-607, 206 |
| POST `/modules/:mid/course/generate` · GET `/modules/:mid/course` · PATCH `/course-sections/:sid` · POST `/course-sections/:sid/report` · PUT `/courses/:cid/progress` · POST `/chapters/:cid/summary` | Cours | SPEC-608, 609 |
| POST `/courses/:cid/conversations` · GET `/courses/:cid/conversations` · GET `/conversations/:id` · POST `/conversations/:id/messages` (flux SSE) · POST `/conversations/:id/self-test/answer` · POST `/tutor/cards` | Discussion tuteur | SPEC-610, 717 |
| POST `/modules/:mid/quiz/attempts` · GET `/attempts/:aid` · PUT `/attempts/:aid/answers/:pos` · POST `/attempts/:aid/answers/:pos/check` · POST `/attempts/:aid/submit` · GET `/attempts/:aid/result` | Quiz, examen, exercice | SPEC-611, 613, 614 |
| GET `/modules/:mid/remediation` · POST `/modules/:mid/remediation/complete` | Remédiation | SPEC-612 |
| POST `/modules/:mid/exercises/:aid/hint` | Indices d'exercice | SPEC-613 |
| POST `/formations/:fid/mock-exams` · PATCH `/formations/:fid/exam-format` | Examen blanc | SPEC-614 |
| GET `/formations/:fid/global-quiz/today?mode=full|micro` · GET `/offline/pack` (paquet hors ligne du jour) · POST `/review-sessions/:sid/answers` · POST `/review-sessions/:sid/complete` · POST `/sync/offline-answers` | Quiz global, hors ligne : session du jour idempotente (200), réponses idempotentes par `clientAnswerId` (409 sur une position déjà répondue, 422 `SESSION_CLOSED` après clôture), clôture idempotente | SPEC-701, 703, 801 |
| GET `/formations/:fid/gaps?nature=` | Mes lacunes | SPEC-615 |
| GET `/formations/:fid/notion-graph` | Carte des notions : nœuds formation/module/notion/apport, liens typés (contient, prérequis, confusion, tuteur, source), maîtrise, lacunes ouvertes et statistiques ; 404 pour la formation d’un autre apprenant, apports et liens personnels filtrés par RLS | SPEC-616 |
| GET `/agenda?from=&to=&formation=` · POST `/slots/:id/move` · GET `/slots/:id/alternatives` · POST `/formations/:fid/replan-options` · POST `/formations/:fid/replan` | Agenda | SPEC-704, 705 |
| GET `/notifications?filter=` · POST `/notifications/:id/read` · POST `/notifications/read-all` · GET `/notifications/unread-count` | Notifications | SPEC-706 |
| GET `/search?q=` | Recherche globale | SPEC-212, 307 |
| GET `/formations/:fid/final-review` · POST `/formations/:fid/maintenance` | Bilan final | SPEC-617 |
| POST `/formations/:fid/group` · GET `/formations/:fid/group` · POST `/groups/:gid/rotate-code` · DELETE `/groups/:gid/members/:uid` · GET `/invitations/:code` · POST `/invitations/:code/accept` · POST `/groups/:gid/leave` | Formations à plusieurs | SPEC-724 |
| GET `/streak` · GET `/milestones` | Série et jalons | SPEC-723 |
| POST `/bricks/:bid/report` · PATCH `/bricks/:bid` (correction apprenant) | Signalement / correction : POST 201 `{ reportId, status: 'open' }` (200 si un signalement ouvert existe déjà), PATCH 200 `{ brickId, version, versionId }` ; 404 brique d'autrui, 409 version obsolète, 422 `BRICK_INVALID` avec `errors[{ code, path, message }]`, 422 `BRICK_RETIRED` | SPEC-609, 501 |
| GET `/dev/sdd/email/outbox` · DELETE `/dev/sdd/email/outbox` | Boîte d'envoi d'e-mails simulée : lecture et purge (`ENABLE_SDD_PAGES` seulement, jamais en production) | SPEC-2207 |
| POST `/dev/sdd/events/demo` (idempotent, 202 `{ jobId }`) · GET `/dev/sdd/events/demo/:runId` | Démonstration du pipeline d'événements et de l'outbox, servie par le worker Python | SPEC-203, SPEC-2207 |
| POST `/dev/sdd/notifications/generate` · POST `/dev/sdd/stripe/session` · POST `/dev/sdd/stripe/simulate` · POST `/dev/sdd/stripe/checkout/{pay,cancel}` | Simulations de notifications et de Stripe (`STRIPE_MODE=mock`, `ENABLE_SDD_PAGES` seulement, jamais en production) | SPEC-2207 |
| POST `/email/unsubscribe?token=` (public, `rateLimit: auth`, 200 page HTML ou `{ ok: true }` avec `Accept: application/json`, 400 `UNSUBSCRIBE_TOKEN_INVALID`) · GET `/email/unsubscribe?token=` (page de confirmation, aucun changement d'état) | Désinscription en un clic (RFC 8058, ADR-0124) | SPEC-204 |

Toute route ajoutée par une spécification doit être ajoutée à ce tableau dans le même commit.

## 3. Versions et clients

`/api/v1` n’accepte que des changements rétrocompatibles : ajout d’un champ facultatif, d’une
route ou d’un code d’erreur. Toute modification incompatible exige une nouvelle base `/api/v2`.
Le retrait d’une route est annoncé par les en-têtes `Deprecation` et `Sunset` au moins quatre-vingt-
dix jours avant son application. Cette stabilité est nécessaire aux clients natifs, qui ne sont
pas nécessairement mis à jour en même temps que le serveur (ADR-1004, ADR-1007, SPEC-1301).

Les clients peuvent s’authentifier par cookie Supabase ou par
`Authorization: Bearer <jeton d’accès>`. Le client partagé `@learny/api-client` prend en charge le
renouvellement unique du jeton après une réponse 401 et la lecture du flux SSE du tuteur. Les
clients natifs n’envoient ni cookie ni `Origin`; une WebView qui envoie `Origin` reste soumise à la
politique CORS et à la garde d’origine définie par ADR-1005.
