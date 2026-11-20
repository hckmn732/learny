# ADR-1007 — Paquets partagés entre clients et serveur

- **Statut** : Acceptée — complète docs/architecture/overview.md §3
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-1001, ADR-1002, ADR-1003, ADR-1004, SPEC-1002, SPEC-1003, SPEC-1004

## Contexte

Les clients (web, mobile) et le serveur doivent partager contrats, types, logique pure et libellés, sans qu'un client n'embarque de code serveur. Aujourd'hui une partie de ce code vit dans `apps/web` (`lib/api-client.ts`, `messages/fr.ts`, `lib/api/*`) ou dans `packages/services` (fonctions pures `home/derive.ts` et `review/game-response.ts` importées par des composants client).

## Décision

Paquets **partagés** (aucun import de `node:*`, de `next/*`, de `react-dom` ni d'un paquet serveur ; exécutables dans un navigateur, sous Node et sous React Native) :

| Paquet | Contenu | Importe |
|---|---|---|
| `@learny/contracts` (existant) | Schémas Zod, `defineRoute`, registre `ROUTES`, événements, DTO, OpenAPI | `core`, `zod` |
| `@learny/core` (existant, entrée `.`) | Horloge injectable, erreurs typées et catalogue, `Result`, identifiants | — (l'entrée `./server` reste serveur) |
| `@learny/api-client` (nouveau) | Client typé de `/api/v1` : `baseUrl`, `fetch` et fournisseur d'en-têtes injectables (cookie transmis, `Authorization: Bearer`, `X-Request-Id`), conversion `problem+json` → `AppError` | `contracts`, `core` |
| `@learny/domain` (nouveau) | Logique pure côté client : dérivations de l'accueil (`home/derive`), réponses des jeux de révision (`review/game-response`) et toute fonction pure appelée par un composant | `contracts`, `core`, `learning-engine` |
| `@learny/i18n` (nouveau) | Messages (`fr`) aujourd'hui dans `apps/web/messages` | — |
| `@learny/learning-engine` (existant) | Moteur déterministe | `core`, `ts-fsrs` |
| `@learny/ui/tokens` (existant, sous-chemin) | Jetons de design | — |

Paquets **serveur** (importables seulement par `apps/api`, les autres paquets serveur et les tests) : `db`, `services`, `jobs`, `llm`, `tutor`, `ingestion`, `automations`, `notifications`, et les nouveaux :

| Paquet | Contenu |
|---|---|
| `@learny/http` | Couche de transport indépendante du framework (ADR-1002) : `handler()`, gardes (origine, limitation, idempotence, acceptation légale), session (cookie et Bearer, ADR-1005), `problem+json`, `requestId`, garde des routes de développement |
| `@learny/api-routes` | Table `ROUTE_IMPLEMENTATIONS` (identifiant de route → fonction qui appelle `packages/services`) et gestionnaires spéciaux (SSE, webhooks, redirections d'authentification, pages HTML de désinscription, Inngest) |

Les règles de dépendance sont vérifiées par ESLint (`import/no-restricted-paths` et règle `learny/web-is-a-client`).

## Conséquences

- `packages/services` n'exporte plus `home/derive` ni `review/game-response` après SPEC-1002 ; il les réimporte depuis `@learny/domain`.
- `apps/web/lib/api-client.ts` devient une réexportation de `@learny/api-client` le temps de la migration, puis disparaît (SPEC-1202).
