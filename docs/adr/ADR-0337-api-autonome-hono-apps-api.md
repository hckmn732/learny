# ADR-0337 — API autonome en Hono (`apps/api`)

- **Statut** : Acceptée — amende ADR-0017
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0336, ADR-0017, ADR-0251, ADR-0258, SPEC-1003, SPEC-1004, SPEC-1101, SPEC-1103

## Contexte

Le backend extrait doit servir le web, les applications natives et d'autres clients, réutiliser sans réécriture les contrats `defineRoute`, le wrapper `handler()` (authentification, Zod, idempotence, limitation, `problem+json`, `requestId`), le flux SSE du tuteur, l'endpoint Inngest et le webhook Stripe, et se déployer à la fois en environnement géré (Vercel, région `fra1`) et en auto-hébergement Docker (Coolify, ADR-0329).

Options étudiées :

| Option | Verdict |
|---|---|
| **Hono** | Retenu. Déjà utilisé par `apps/worker` ; API `Request`/`Response` standard, donc le wrapper existant se porte presque tel quel ; streaming SSE natif ; adaptateurs Node (`@hono/node-server`), Vercel et Docker ; démarrage à froid court. |
| NestJS | Écarté : décorateurs et modules qui doublonnent `defineRoute` et `packages/services` ; réécriture de toute la couche d'entrée. |
| Fastify | Écarté : objets `req`/`reply` propres à Node, portage plus lourd, pas d'exécution sur environnement de type edge. |
| tRPC | Écarté : clients TypeScript uniquement ; l'API REST + OpenAPI 3.1 actuelle sert mieux des clients tiers et natifs. |
| Garder Next.js pour l'API (application Next dédiée) | Écarté : coût de démarrage et d'empreinte d'un framework d'écrans pour servir du JSON, dépendance à l'écosystème Next pour le backend. |

## Décision

1. `apps/api` est une application **Hono 4** (Node 24) qui **monte automatiquement** toutes les routes du registre `ROUTES` de `@learny/contracts` à partir de la table d'implémentation de `@learny/api-routes` (ADR-0342) ; une route sans implémentation est une erreur de typage.
2. La couche de transport (wrapper `handler()`, gardes, idempotence, limitation, conversion d'erreurs, journalisation) vit dans `@learny/http`, indépendante de tout framework (`Request` → `Response`). `apps/api` l'adapte à Hono ; `apps/web` l'adapte à Next pendant la transition seulement.
3. `apps/api` sert aussi `/api/inngest` (fonctions de `@learny/jobs`), `/api/v1/webhooks/stripe` (corps brut) et le flux SSE `POST /api/v1/conversations/:id/messages`, sans changement de contrat.
4. **`apps/worker` est absorbé** : le même binaire `apps/api` sert l'API et les jobs ; la variable `LEARNY_API_ROLE` (`all` par défaut, `api`, `jobs`) permet de séparer les processus en auto-hébergement. ADR-0017 est amendé : les fonctions Inngest sont servies par `apps/api` dans tous les environnements.
5. Déploiement : image Docker `docker/api.Dockerfile` (Coolify, auto-hébergement, QA) et projet Vercel dédié `learny-api` en région `fra1` pour les environnements gérés, chaque environnement plaçant `apps/api` dans la même région que `apps/web` et la base.
6. Port local par défaut : **3001** (celui du worker), `API_INTERNAL_URL=http://127.0.0.1:3001`.

## Conséquences

- Les tests d'intégration des routes s'exécutent contre `app.request()` de Hono au lieu de `next-test-api-route-handler`.
- Playwright démarre deux serveurs (web et API) à partir de SPEC-1101.
- Les journaux, Sentry et les en-têtes `RateLimit-*`, `Server-Timing` et `X-Request-Id` gardent le même format.
