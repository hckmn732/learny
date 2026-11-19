# ADR-0338 — Frontend Next.js, client pur de l'API

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0336, ADR-0041, ADR-0252, ADR-0332, ADR-0333, SPEC-1201, SPEC-1202, SPEC-1203

## Contexte

Le frontend doit être une application React. `apps/web` est déjà une application React 19 (Next.js App Router) avec 58 pages, une PWA hors ligne (serwist), des budgets de performance (ADR-0041, ADR-0332) et une suite e2e et visuelle complète. Passer à une SPA Vite imposerait de réécrire le routage, le rendu serveur, le service worker et une partie des tests, sans bénéfice pour la séparation.

## Décision

1. `apps/web` **reste en Next.js** et devient un **client pur** de l'API : aucun import de `@learny/db`, `@learny/services`, `@learny/jobs`, `@learny/llm`, `@learny/tutor`, `@learny/ingestion`, `@learny/automations`, `@learny/notifications` (règle ESLint `learny/web-is-a-client`, SPEC-1001).
2. Le rendu serveur est conservé : les Server Components et le proxy (`proxy.ts`) obtiennent leurs données **par l'API**, avec le client typé `@learny/api-client` en mode serveur, qui transmet le cookie de session et l'en-tête `X-Request-Id` (SPEC-1202).
3. Pendant et après la bascule, le navigateur continue d'appeler **la même origine** : `apps/web` réécrit `/api/v1/*`, `/api/inngest` et les webhooks vers `API_INTERNAL_URL` (réécriture Next `afterFiles`), donc ni CORS ni changement de cookie pour le web (SPEC-1201).
4. Budget du saut supplémentaire : le temps serveur médian d'une page rendue côté serveur ne doit pas augmenter de plus de **25 ms** par rapport à la référence mesurée avant SPEC-1202 sur la même machine (`pnpm test:perf`) ; les budgets ADR-0041/ADR-0332 restent inchangés.
5. Vite (SPA) est écarté pour cette migration ; il pourra être réévalué par un ADR distinct.

## Conséquences

- Les pages de démonstration SDD (ADR-0049) qui appelaient les services passent par des routes `dev.sdd.*` de l'API, actives seulement avec `ENABLE_SDD_PAGES=true` (SPEC-1203).
- `apps/web/package.json` ne dépend plus des paquets serveur à la fin de SPEC-1203.
