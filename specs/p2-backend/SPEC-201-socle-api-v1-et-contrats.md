---
id: SPEC-201
title: Socle API v1 et contrats
phase: P2
priority: V1
depends_on: [SPEC-006, SPEC-101]
business_rules: []
screens: []
adrs: [ADR-0004, ADR-0063, ADR-0120, ADR-0219]
visual: demo
---

# SPEC-201 — Socle API v1 et contrats

## 1. Objectif

Livrer le socle commun à toutes les routes `/api/v1/*` : le paquet de contrats Zod `@learny/contracts`, le wrapper `handler()` (authentification, validation, `problem+json`, `requestId`, idempotence, pagination, point d'insertion de la limitation de débit), le catalogue des codes d'erreur métier, le client API typé du navigateur, le fournisseur TanStack Query, la génération du document OpenAPI 3.1 et le squelette du paquet `@learny/services` (contexte d'exécution). Toutes les spécifications fonctionnelles ultérieures construisent leurs routes sur ce socle, sans jamais réimplémenter ces mécanismes.

## 2. Contexte

- API REST intégrée à Next.js (ADR-0004), logique dans `packages/services`, routes sans logique métier (`docs/architecture/api.md` §1).
- Données côté client avec TanStack Query v5, clés `['<domaine>', id]` (ADR-0063).
- Conventions d'erreurs RFC 9457, pagination par curseur, codes HTTP : `docs/architecture/api.md` §1.
- Tables `idempotency_keys` et `rate_limits` : `docs/architecture/data-model.md` §12 (créées par SPEC-112).
- Frontières de paquets : `docs/architecture/overview.md` §3 ; conventions `Result<T, AppError>` : `docs/engineering/conventions.md` §2.
- Documents à lire : `docs/architecture/api.md`, `docs/architecture/overview.md` §3-4, `docs/engineering/conventions.md`, `docs/engineering/testing.md`, ADR-0004, ADR-0063, ADR-0043, ADR-0047, ADR-0049, ADR-0120.

## 3. Dépendances

- **SPEC-006** : structure `apps/web` (`app/`, `lib/`, `messages/fr.ts`), route `/api/v1/health`, client API minimal `apps/web/lib/api-client.ts` (remplacé ici par la version typée), pages `/_dev/sdd/[specId]` activées par `ENABLE_SDD_PAGES`.
- **SPEC-101** : `@learny/db` — `userDb(ctx)` (JWT → RLS), `serviceDb()`, `withRollback`, `createTestUser`. Les tables `idempotency_keys` et `rate_limits` existent (SPEC-112, phase P1 terminée avant P2).
- Déjà présents (P0) : `@learny/core` (`clock`, `logger` pino avec `requestId` — SPEC-004/SPEC-010), `@learny/config` (variables, SPEC-009), `@learny/testing` (horloge figée, fabriques).
- Bibliothèques : `zod` ≥ 4 (fonction native `z.toJSONSchema`), `@tanstack/react-query` ≥ 5, `@supabase/ssr` ≥ 0.6, `@supabase/supabase-js` ≥ 2, `next-test-api-route-handler` ≥ 4 (tests).
- Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (origine publique de l'application, ex. `http://localhost:3000` ; l'ajouter au schéma de `@learny/config` si absente), `ENABLE_SDD_PAGES`. Aucun service externe : rien à simuler.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est rattachée à cette spécification dans le catalogue : elle fournit l'infrastructure. Elle prépare toutefois l'application homogène de BR-PLA-08 (secrets côté serveur, limitation de débit insérée dans le wrapper puis implémentée par SPEC-208) et la traçabilité des erreurs (requestId exposé à l'utilisateur, utilisé par SPEC-308).

## 5. Exigences fonctionnelles

- **EF-1** Toute réponse d'erreur d'une route `/api/v1/*` est un document `application/problem+json` : `{ type, title, status, detail, code, requestId, errors? }` où `type = "https://learny.app/errors/<code en kebab-case>"`, `title` est le libellé français du code (catalogue), `detail` une phrase française sans donnée sensible, `errors` (seulement pour `VALIDATION_FAILED`) un tableau `{ path: string, message: string }` (chemin pointé, ex. `body.title`).
- **EF-2** Chaque réponse (succès ou erreur) porte l'en-tête `X-Request-Id`. Un `X-Request-Id` entrant conforme à `^[A-Za-z0-9-]{8,64}$` est repris ; sinon un UUID v4 est généré.
- **EF-3** Une route déclarée `auth: 'user'` répond `401 UNAUTHENTICATED` sans session valide, `403 EMAIL_NOT_CONFIRMED` si l'e-mail n'est pas confirmé. `auth: 'public'` n'exige rien.
- **EF-4** Une route déclarée `idempotent: true` (POST qui crée) exige l'en-tête `Idempotency-Key` (`^[A-Za-z0-9_-]{8,128}$`) : absent ou invalide → `400 IDEMPOTENCY_KEY_REQUIRED`. Un rejeu avec la même clé, la même route et le même corps renvoie la réponse enregistrée à l'identique (statut, corps) avec l'en-tête `Idempotent-Replayed: true`, sans réexécuter le service.
- **EF-5** Réutiliser une clé pour une autre route ou un autre corps → `422 IDEMPOTENCY_KEY_REUSED`. Une requête concurrente avec une clé dont le traitement est en cours → `409 IDEMPOTENCY_IN_PROGRESS` avec `Retry-After: 1`.
- **EF-6** Pagination : paramètres `cursor` (opaque) et `limit` (entier, défaut 20, min 1, max 100) ; réponse `{ items: T[], nextCursor: string | null }`. `limit=101` → `400 VALIDATION_FAILED`. Curseur illisible → `400 VALIDATION_FAILED` (`errors[0].path = "query.cursor"`).
- **EF-7** Codes de succès : 200 lecture/mise à jour, 201 création, 202 `{ jobId }` pour un traitement asynchrone, 204 sans corps.
- **EF-8** Le document `apps/web/public/openapi.json` (OpenAPI 3.1) décrit toutes les routes enregistrées dans le registre des contrats ; il est servi statiquement à `/openapi.json`.
- **EF-9** Côté navigateur, `api.<route>(input)` renvoie la sortie typée ou lève une `ApiError` portant `status`, `code`, `detail`, `requestId`, `errors`. Les mutations idempotentes génèrent automatiquement une clé, réutilisée en cas de nouvel essai réseau du même appel.
- **EF-10** Page `/_dev/sdd/SPEC-201` : démontre validation, erreur métier, idempotence et pagination (section 10).

## 6. Exigences techniques

**ET-1 — Paquet `@learny/contracts`** (`packages/contracts`) : n'importe que `zod` et `@learny/core` (types). Structure :
```
src/index.ts            réexporte tout
src/common.ts           Uuid, IsoDateTime, CivilDate, PaginationQuery, page(), ProblemDetails, JobAccepted, Empty
src/routes.ts           defineRoute(), registre ROUTES, type RouteDef
src/openapi.ts          buildOpenApiDocument(routes): OpenAPIV3_1 document
src/dev.ts              contrats des routes de démonstration (EchoInput, DevItem)
src/<domaine>.ts        ajoutés par les spécifications suivantes (auth.ts, me.ts, billing.ts…)
```
```ts
export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
export const CivilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PaginationQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export const ProblemDetails = z.object({
  type: z.string().url(), title: z.string(), status: z.number().int(),
  detail: z.string(), code: z.string().regex(/^[A-Z][A-Z0-9_]+$/), requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export const JobAccepted = z.object({ jobId: z.string() });

export interface RouteDef<P, Q, B, O> {
  id: string;                       // 'dev.echo', 'auth.signIn'… unique
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                     // '/api/v1/dev/sdd/echo', paramètres ':id'
  auth: 'user' | 'public';
  params?: z.ZodType<P>; query?: z.ZodType<Q>; body?: z.ZodType<B>;
  output: z.ZodType<O> | null;      // null → 204
  successStatus: 200 | 201 | 202 | 204;
  idempotent?: boolean;
  rateLimit?: 'default' | 'ai' | 'auth' | 'none';   // défaut 'default'
  summary: string;                  // français, pour OpenAPI
  errors: ErrorCode[];              // codes métier possibles (documentation)
}
export function defineRoute<P, Q, B, O>(def: RouteDef<P, Q, B, O>): RouteDef<P, Q, B, O>;
```
`ROUTES` est un objet `Record<string, RouteDef>` agrégé dans `routes.ts` (chaque domaine exporte ses routes, `routes.ts` les fusionne). Un test vérifie l'unicité de `id` et de `method + path`.

**ET-2 — Catalogue d'erreurs** (`packages/core/src/errors.ts`) :
```ts
export const ERROR_CATALOG = {
  VALIDATION_FAILED:        { status: 400, title: 'Données invalides' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, title: "Clé d'idempotence manquante" },
  UNAUTHENTICATED:          { status: 401, title: 'Connexion requise' },
  FORBIDDEN:                { status: 403, title: 'Accès refusé' },
  EMAIL_NOT_CONFIRMED:      { status: 403, title: 'Adresse e-mail non vérifiée' },
  ORIGIN_NOT_ALLOWED:       { status: 403, title: 'Origine non autorisée' },
  NOT_FOUND:                { status: 404, title: 'Introuvable' },
  CONFLICT:                 { status: 409, title: 'Conflit' },
  IDEMPOTENCY_IN_PROGRESS:  { status: 409, title: 'Requête déjà en cours' },
  PAYLOAD_TOO_LARGE:        { status: 413, title: 'Requête trop volumineuse' },
  IDEMPOTENCY_KEY_REUSED:   { status: 422, title: "Clé d'idempotence déjà utilisée" },
  FORMATION_LIMIT_REACHED:  { status: 422, title: 'Trois formations actives au plus' },
  MODULE_LOCKED:            { status: 422, title: 'Module verrouillé' },
  AI_UNAVAILABLE:           { status: 422, title: 'IA indisponible pour cette tâche' },
  AI_CAP_REACHED:           { status: 422, title: "Plafond d'IA du jour atteint" },
  RETRY_NOT_YET_ALLOWED:    { status: 422, title: 'Nouvelle tentative pas encore possible' },
  UPLOAD_TOO_LARGE:         { status: 422, title: 'Fichier trop volumineux' },
  RATE_LIMITED:             { status: 429, title: 'Trop de requêtes' },
  INTERNAL_ERROR:           { status: 500, title: 'Erreur interne' },
  SERVICE_UNAVAILABLE:      { status: 503, title: 'Service momentanément indisponible' },
} as const satisfies Record<string, { status: number; title: string }>;
export type ErrorCode = keyof typeof ERROR_CATALOG;
export class AppError extends Error {
  constructor(readonly code: ErrorCode, readonly detail: string,
              readonly extra?: { errors?: { path: string; message: string }[]; retryAfterSec?: number; cause?: unknown });
}
```
Les spécifications suivantes **ajoutent** leurs codes à ce catalogue (une ligne par code, statut et titre) dans le même commit que la route qui les utilise. `packages/core/src/result.ts` (créé s'il n'existe pas) : `type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }`, `ok(v)`, `err(e)`.

**ET-3 — Wrapper** (`apps/web/lib/api/handler.ts`) :
```ts
export function handler<P, Q, B, O>(
  route: RouteDef<P, Q, B, O>,
  fn: (args: { ctx: RequestContext; params: P; query: Q; body: B; request: NextRequest }) =>
        Promise<Result<O> | O>,
): (request: NextRequest, segment: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface RequestContext extends ServiceContext { request: NextRequest; ip: string }
```
Ordre d'exécution, normatif :
1. `requestId` (EF-2) ; journal enfant `logger.child({ requestId, route: route.id })`.
2. Garde de limitation de débit : `getRateLimiter().consume({ profile, userId|ip, routeId })` (SPEC-201 fournit l'interface `RateLimiter` et `noopRateLimiter` enregistré par défaut ; SPEC-208 enregistre l'implémentation réelle via `setRateLimiter`). Refus → `429 RATE_LIMITED` + `Retry-After`.
3. Garde d'origine : `getOriginGuard().check(request)` (no-op par défaut, implémentée par SPEC-208).
4. Authentification (`auth: 'user'`) : `getSessionUser(request)` (`apps/web/lib/api/session.ts`, `createServerClient` de `@supabase/ssr` sur les cookies, puis `auth.getUser()`), contrôle `email_confirmed_at`.
5. Validation `params`, `query` (objet construit depuis `URLSearchParams`, valeurs répétées → tableau), `body` (JSON ; corps > 1 Mo → `413 PAYLOAD_TOO_LARGE` ; JSON invalide → `400 VALIDATION_FAILED` `path: "body"`). Erreurs Zod → `errors[]` avec chemin préfixé `params.`, `query.` ou `body.`.
6. Idempotence (si `idempotent`) : ADR-0120, ET-4.
7. Appel `fn` avec `ctx = createServiceContext({ userId, accessToken, requestId, logger })`.
8. Résultat : `Result` en erreur ou `AppError` levée → problème RFC 9457 ; autre exception → `500 INTERNAL_ERROR` (`detail: "Une erreur inattendue est survenue. Référence : <requestId>."`), exception transmise au rapporteur d'erreurs de SPEC-010.
9. Validation de la sortie par `route.output.safeParse` ; échec → journal `error` (`contract_violation`) et `500 INTERNAL_ERROR` (jamais de sortie non conforme).
10. Réponse JSON avec `successStatus` ; `Cache-Control: no-store` sur toute réponse `auth: 'user'`.
Journal final `info` : `{ requestId, route, status, durationMs, userId }` (jamais de corps).

**ET-4 — Idempotence** (`apps/web/lib/api/idempotency.ts`, ADR-0120) : `requestHash = sha256(method + ' ' + route.path + '\n' + canonicalJson(params) + '\n' + canonicalJson(body))` (clés triées). Les colonnes `request_hash text not null` et `completed_at timestamptz null` sont créées par SPEC-112 (ADR-0219) : cette spécification n'ajoute aucune migration sur `idempotency_keys` et un test de schéma vérifie leur présence. Algorithme (client `serviceDb()`, opérations explicitement autorisées ici) :
1. `insert into idempotency_keys (key, user_id, route, request_hash, status_code, response, created_at) values (…, 0, null, clock.now()) on conflict (user_id, key) do nothing returning key`.
2. Si inséré → exécuter ; en succès ou erreur 4xx : `update … set status_code, response, completed_at = clock.now()` ; en 5xx ou exception : `delete` de la ligne (nouvel essai possible).
3. Si conflit → lire la ligne : `created_at < now − 24 h` → la supprimer et reprendre en 1 ; `route` ou `request_hash` différent → 422 ; `status_code = 0` → 409 + `Retry-After: 1` ; sinon rejouer.
Seules les routes `auth: 'user'` peuvent être `idempotent` (la clé est portée par `user_id`) ; un test de cohérence du registre l'impose.

**ET-5 — Pagination** (`packages/contracts/src/cursor.ts`) : `encodeCursor(value: { k: string | number; id: string }): string` = base64url(JSON) ; `decodeCursor(s): { k; id } | null`. Les repositories trient par `(k desc, id desc)` et lisent `limit + 1` lignes ; présence de la ligne supplémentaire → `nextCursor`.

**ET-6 — Contexte de service** (`packages/services`) : `src/index.ts`, `src/context.ts`.
```ts
export interface ServiceContext {
  userId: string | null; requestId: string;
  db: UserDb | null;            // userDb({ userId, accessToken }) ; null si public
  clock: Clock; logger: Logger;
}
export function createServiceContext(o: { userId: string | null; accessToken: string | null;
  requestId: string; logger?: Logger; clock?: Clock }): ServiceContext;
export function createSystemContext(o: { requestId: string; logger?: Logger }): ServiceContext & { sdb: ServiceDb };
```
`src/dev/echo.ts` : service de démonstration `devEcho(ctx, input)` (renvoie `{ message, receivedAt: clock.now().toISOString(), counter }` où `counter` est le nombre d'exécutions effectives depuis le démarrage, conservé en mémoire, pour prouver l'absence de réexécution) et `listDevItems(ctx, { cursor, limit })` (57 éléments déterministes `item-01`…`item-57`).

**ET-7 — Routes de démonstration** (nouvelles, actives seulement si `ENABLE_SDD_PAGES` vaut `true` ou `1`, sinon `404 NOT_FOUND` ; jamais en production) :
| Méthode et chemin | Entrée | Sortie | Erreurs |
|---|---|---|---|
| POST `/api/v1/dev/sdd/echo` (`auth: 'user'`, `idempotent`) | `{ message: string(1..200), fail?: 'business' \| 'crash' }` | 201 `{ message, receivedAt, counter }` | 400, 401, 409, 422 (`FORMATION_LIMIT_REACHED` si `fail = 'business'`), 500 si `crash` |
| GET `/api/v1/dev/sdd/items` (`auth: 'user'`) | `PaginationQuery` | 200 `page(DevItem)` (`{ id, label, position }`) | 400, 401 |
Le dossier est `apps/web/app/api/v1/dev/sdd/` (pas de préfixe `_`, réservé aux dossiers privés de l'App Router).

**ET-8 — OpenAPI** : `pnpm openapi:generate` (script racine → `tsx packages/contracts/scripts/generate-openapi.ts`) écrit `apps/web/public/openapi.json` : `openapi: '3.1.0'`, `info { title: 'Learny API', version: <version de package.json racine> }`, `servers [{ url: '/' }]`, un chemin par route (paramètres `:id` → `{id}`), schémas via `z.toJSONSchema(schema, { target: 'openapi-3.0' })` puis normalisés 3.1, réponse d'erreur `application/problem+json` référençant `#/components/schemas/ProblemDetails`, `security: [{ cookieAuth: [] }]` si `auth: 'user'`. Sortie déterministe (clés triées, indentation 2). Un test échoue si le fichier commité diffère de la génération (`pnpm openapi:check`).

**ET-9 — Client typé** (`apps/web/lib/api-client.ts`) :
```ts
export class ApiError extends Error { status: number; code: string; detail: string; requestId: string; errors?: {path:string;message:string}[] }
export async function callApi<R extends RouteDef<any, any, any, any>>(route: R,
  input: { params?: …; query?: …; body?: … }, opts?: { idempotencyKey?: string; signal?: AbortSignal }): Promise<Output<R>>;
export const api: { [K in keyof typeof ROUTES]: (input) => Promise<Output<(typeof ROUTES)[K]>> };
```
`credentials: 'same-origin'`, `Content-Type: application/json`, clé `crypto.randomUUID()` si `idempotent` et non fournie ; erreur réseau → `ApiError { status: 0, code: 'NETWORK_ERROR' }`. 204 → `undefined`.

**ET-10 — TanStack Query** : `apps/web/app/providers.tsx` (`'use client'`) avec `QueryClient` : `staleTime: 30_000`, `gcTime: 300_000`, `refetchOnWindowFocus: true`, `retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2`, mutations `retry: 0`. Intégré dans `app/layout.tsx`. `apps/web/lib/query-keys.ts` : fabrique `qk.<domaine>(id?)` → `['<domaine>', id]`.

**ET-11 — Performance** : surcoût du wrapper (hors service) p95 < 15 ms en intégration locale (mesure consignée).

## 7. Comportements attendus et cas limites

- **CL-1 Double clic / rejeu réseau** : deux POST identiques simultanés avec la même clé → un seul `201`, l'autre `409 IDEMPOTENCY_IN_PROGRESS` ; un troisième après la fin → rejoue le `201` (`counter` identique).
- **CL-2 Clé réutilisée avec un autre corps** → `422 IDEMPOTENCY_KEY_REUSED`, service non appelé.
- **CL-3 Erreur 5xx pendant un traitement idempotent** → ligne supprimée ; le nouvel essai avec la même clé réexécute.
- **CL-4 Clé expirée** : ligne vieille de 24 h + 1 min (horloge figée avancée) → considérée absente, traitement réexécuté.
- **CL-5 Session expirée** entre deux appels → 401 ; le client n'essaie pas à nouveau (4xx) et SPEC-202 redirige.
- **CL-6 Corps JSON invalide ou > 1 Mo** → 400 `path: "body"` ou 413, sans appeler le service.
- **CL-7 Sortie non conforme au contrat** (régression d'un service) → 500 journalisé `contract_violation`, aucune fuite de données partielles.
- **CL-8 `X-Request-Id` malveillant** (`<script>` ou 500 caractères) → ignoré, UUID généré.
- **CL-9 Curseur forgé** (base64 valide mais JSON sans `id`) → 400 ; curseur d'une autre liste → résultats vides ou cohérents, jamais d'erreur 500.
- **CL-10 Pages de démonstration désactivées** → routes `dev/sdd/*` en 404 (`problem+json`).

## 8. Instructions d'implémentation

1. Créer `packages/contracts` (package.json `@learny/contracts`, exports `.`, tsconfig, README) ; écrire `common.ts`, `cursor.ts`, `routes.ts`, `dev.ts`, `index.ts`. Ajouter la règle de frontière ESLint (contracts n'importe que zod et core).
2. Compléter `packages/core/src/errors.ts` (catalogue ET-2, `AppError`, `toProblem(error, requestId)`), `result.ts` si absent ; exporter depuis `@learny/core`. Commit `feat(SPEC-201): catalogue d'erreurs et contrats communs`.
3. Écrire le test de schéma qui vérifie la présence des colonnes `request_hash` et `completed_at` de `idempotency_keys` (créées par SPEC-112, ADR-0219) ; aucune migration n'est ajoutée.
4. Créer `packages/services` (`@learny/services`) : `context.ts`, `dev/echo.ts`, `index.ts`. Commit `feat(SPEC-201): squelette du paquet services`.
5. Écrire `apps/web/lib/api/` : `request-id.ts`, `session.ts`, `problem.ts`, `validate.ts`, `idempotency.ts`, `rate-limit.ts` (interface + no-op + `setRateLimiter`), `origin.ts` (interface + no-op + `setOriginGuard`), `handler.ts`. Commit `feat(SPEC-201): wrapper handler et idempotence`.
6. Créer les routes `apps/web/app/api/v1/dev/sdd/echo/route.ts` et `items/route.ts` (garde `ENABLE_SDD_PAGES`).
7. Écrire `api-client.ts`, `query-keys.ts`, `providers.tsx`, brancher le fournisseur dans `app/layout.tsx`. Commit `feat(SPEC-201): client API typé et TanStack Query`.
8. Écrire `generate-openapi.ts`, scripts `openapi:generate` et `openapi:check`, générer `apps/web/public/openapi.json`. Commit `build(SPEC-201): génération OpenAPI`.
9. Page de démonstration (section 10) ; ajouter les routes de démonstration et la mention du socle au tableau de `docs/architecture/api.md` (une ligne « Démonstration SDD »).
10. Écrire les tests (section 12) ; commit `test(SPEC-201): wrapper, idempotence, pagination, OpenAPI`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/{package.json,tsconfig.json,README.md}`, `packages/contracts/src/{index,common,cursor,routes,openapi,dev}.ts`, `packages/contracts/scripts/generate-openapi.ts`, `packages/services/{package.json,tsconfig.json,README.md}`, `packages/services/src/{index,context}.ts`, `packages/services/src/dev/echo.ts`, `apps/web/lib/api/{handler,request-id,session,problem,validate,idempotency,rate-limit,origin}.ts`, `apps/web/lib/query-keys.ts`, `apps/web/app/providers.tsx`, `apps/web/app/api/v1/dev/sdd/{echo,items}/route.ts`, `apps/web/public/openapi.json`, `apps/web/components/sdd/Spec201Demo.tsx`, migration `idempotency_keys`.
- **Modifiés** : `packages/core/src/errors.ts` (catalogue), `packages/core/src/index.ts`, `apps/web/lib/api-client.ts` (typé), `apps/web/app/layout.tsx` (fournisseur), `package.json` racine (scripts), `eslint.config.*` (frontière contracts), `docs/architecture/api.md` (ligne démonstration), registre des démonstrations de SPEC-006.
- **Lus** : `@learny/db`, `@learny/core` (clock, logger), `@learny/config`.

## 10. Interface et conformité visuelle

Mode `demo` (ADR-0049). Page `/_dev/sdd/SPEC-201`, mise en page de démonstration de SPEC-006, composants du jeton de base (fond `#F4F4F1`, cartes blanches bordées `#E7E6E1` rayon 24 px, texte `#111113`, police Inter ; titres Space Grotesk).
Structure (ordre, textes exacts) :
1. Titre `h1` « SPEC-201 — Socle API v1 et contrats ».
2. Carte « Validation » (`data-testid="demo-validation"`) : bouton « Envoyer un message vide » → affiche le problème JSON reçu (`code`, `status`, `errors`) dans `pre[data-testid="demo-validation-result"]`.
3. Carte « Erreur métier » (`demo-business`) : bouton « Déclencher une erreur métier » → `FORMATION_LIMIT_REACHED`, 422, `requestId`.
4. Carte « Idempotence » (`demo-idempotency`) : champ « Message », bouton « Envoyer deux fois avec la même clé » → deux lignes de résultat (`demo-idem-first`, `demo-idem-second`) affichant statut, `counter`, en-tête `Idempotent-Replayed`.
5. Carte « Pagination » (`demo-pagination`) : liste de 20 éléments, bouton « Page suivante » jusqu'à épuisement (57 éléments, 3 pages), compteur « n éléments chargés ».
6. Carte « OpenAPI » (`demo-openapi`) : nombre de routes documentées et lien « Ouvrir openapi.json ».
États : chargement (Skeleton de SPEC-006 ou texte « Chargement… » avec `aria-busy`), erreur (message + « Réessayer »). Accessibilité : boutons natifs, résultats dans `aria-live="polite"`.
Contrôles visuels (testing.md §6, contrôles 1, 2, 4) : jetons (`body` fond `rgb(244, 244, 241)`, cartes `border-color rgb(231, 230, 225)`, `border-radius 24px` à l'échelle 90 %, titre en Space Grotesk), présence et ordre des 5 cartes, ligne de base `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`) après déroulé du scénario.

## 11. Critères d'acceptation

- **CA-1** Toute erreur de validation renvoie 400 `application/problem+json` conforme à `ProblemDetails`, avec `errors[].path` préfixé et `X-Request-Id` identique au champ `requestId`.
- **CA-2** Un POST idempotent rejoué avec la même clé renvoie le même statut et le même corps (`counter` inchangé) et `Idempotent-Replayed: true` ; 2 requêtes concurrentes produisent exactement une exécution.
- **CA-3** Clé réutilisée pour un autre corps → 422 `IDEMPOTENCY_KEY_REUSED` ; clé absente → 400 `IDEMPOTENCY_KEY_REQUIRED`.
- **CA-4** La pagination parcourt 57 éléments en 3 pages (20, 20, 17) puis `nextCursor = null` ; `limit=101` et curseur forgé → 400.
- **CA-5** Une route `auth: 'user'` sans session → 401 `UNAUTHENTICATED` ; une sortie non conforme au contrat → 500 sans fuite.
- **CA-6** `openapi.json` est valide OpenAPI 3.1 (validé par `@readme/openapi-parser`), contient chaque route du registre et `pnpm openapi:check` passe.
- **CA-7** La page `/_dev/sdd/SPEC-201` déroule les 4 démonstrations ; elle et les routes `dev/sdd/*` renvoient 404 quand `ENABLE_SDD_PAGES` est désactivé.

## 12. Plan de tests

- **Unitaires** :
  - `packages/core/src/errors.test.ts` — `describe('[SPEC-201] catalogue d'erreurs')` : statut et titre de chaque code, `toProblem` (type kebab-case, `errors` seulement pour `VALIDATION_FAILED`), codes en `SCREAMING_SNAKE_CASE`.
  - `packages/contracts/src/cursor.test.ts` — `[SPEC-201] curseur` : aller-retour, curseur forgé → `null`.
  - `packages/contracts/src/routes.test.ts` — `[SPEC-201] registre` : unicité `id` et `method+path`, `idempotent` ⇒ `auth: 'user'` et méthode POST, `output: null` ⇔ 204.
  - `apps/web/lib/api/request-id.test.ts`, `validate.test.ts` — `[SPEC-201]` : reprise/rejet d'`X-Request-Id`, chemins préfixés, tableaux de query.
  - `apps/web/lib/api-client.test.ts` — `[SPEC-201] client typé` (MSW) : `ApiError`, 204, clé générée et réutilisée au nouvel essai.
- **Intégration** (`apps/web/test/integration/api-handler.test.ts`, `next-test-api-route-handler`, Supabase local, `createTestUser`) — `describe('[SPEC-201] handler')` : 401 sans session ; 400 validation ; 422 métier ; 500 crash avec `requestId` ; idempotence (rejeu, concurrence `Promise.all`, autre corps, 5xx puis réessai, expiration à 24 h avec horloge avancée) ; pagination 57 éléments ; contrat de sortie violé (service simulé) → 500 ; 404 si `ENABLE_SDD_PAGES=false`. `packages/contracts/test/integration/openapi.test.ts` — `[SPEC-201] openapi` : génération = fichier commité, validation par le parseur.
- **End-to-end** (`apps/web/e2e/specs/p2/spec-201-socle-api.spec.ts`, vidéo) : `test('démonstration du socle API @SPEC-201', …)` : connexion d'un utilisateur de fabrique (cookie de session injecté par le helper de `@learny/testing`), ouverture de `/_dev/sdd/SPEC-201`, clic sur chaque démonstration, assertions sur les codes affichés, 3 pages de pagination, `counter` identique au second envoi.
- **Visuel** : `test('page de démonstration SPEC-201 @SPEC-201 @visual', …)` : `expectTokens` (fond, bordures, rayon, polices), structure des 5 cartes, `toHaveScreenshot('spec-201-demo.png', { maxDiffPixelRatio: 0.01 })`.
- **Non-régression** : `@SPEC-006` (santé, pages de démonstration), `[SPEC-101]`, `[SPEC-112]` (idempotency_keys).
- **Traçabilité** :
| Critère | Tests |
|---|---|
| CA-1 | int `[SPEC-201] handler` validation ; unit `validate.test.ts` |
| CA-2 | int idempotence rejeu/concurrence ; e2e `@SPEC-201` |
| CA-3 | int idempotence autre corps / clé absente |
| CA-4 | int pagination ; e2e `@SPEC-201` |
| CA-5 | int 401 et contrat violé |
| CA-6 | int `[SPEC-201] openapi` |
| CA-7 | e2e `@SPEC-201`, visuel `@SPEC-201 @visual`, int 404 |

## 13. Preuves attendues

`evidence/SPEC-201/` : vidéo du scénario e2e (`video/01-demonstration-du-socle-api.webm`), capture finale de la page, ligne de base visuelle, rapports Vitest/Playwright, `openapi.json` validé (sortie du test), mesure du surcoût p95 du wrapper dans `acceptance.md` (CA-1).

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : `pnpm openapi:check` vert dans `pnpm lint` (ajouté à la chaîne de lint), aucune route existante (`/health`) régressée, colonnes `request_hash` et `completed_at` de `idempotency_keys` présentes après `pnpm db:reset`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0004 (API intégrée), ADR-0063 (TanStack Query), ADR-0043 (requestId), ADR-0047 (horloge), ADR-0049 (démonstration), ADR-0022 (accès service limité aux opérations listées).
- **Décision créée** : ADR-0120 « Idempotence et pagination de l'API » — empreinte de requête, en-tête de rejeu, traitement des 5xx, expiration 24 h, colonnes `request_hash` et `completed_at`, curseur base64url `{k,id}`. ADR-0219 confirme ADR-0120 face à ADR-0206 (remplacée) et attribue la création des colonnes à SPEC-112.
- Décisions locales : 401 pour session absente, 403 `EMAIL_NOT_CONFIRMED` ; validation systématique des sorties ; corps limité à 1 Mo (les fichiers passent par URL signée, SPEC-206) ; routes de démonstration sous `/api/v1/dev/sdd/` (dossier sans `_`).
- **Décision créée** : ADR-0251 « Socle API v1 : surcharge de handler(), OpenAPI 3.1 natif et accès service de l'idempotence » (surcharge du wrapper SPEC-010, JSON Schema 2020-12 natif, `serviceDb` limité à l'idempotence, sessions de test réelles).
- Hypothèse : SPEC-010 fournit `reportError(error, context)` ; s'il n'existe pas, le wrapper journalise en `error` et SPEC-010 sera rejoué en non-régression.
