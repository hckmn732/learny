# ADR-0004 — Application web Next.js, API intégrée

- **Statut** : Remplacée par ADR-0336
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, SPEC-006, SPEC-201

> Remplacée par ADR-0336 (séparation backend/frontend, 2026-11-18) : l’API vit dans `apps/api` (ADR-0337) et `apps/web` devient un client pur (ADR-0338). Le texte ci-dessous est conservé pour l’historique.

## Contexte

Un seul déploiement pour écrans, API et PWA ; pas de service d'API séparé en V1.

## Décision

`apps/web` : Next.js (App Router, React 19, Server Components), Tailwind CSS 4. API REST versionnée `/api/v1` en route handlers ; logique dans `packages/services`. Lecture des écrans par Server Components via les services ; mutations par l'API.

## Conséquences

L'API reste extractible plus tard (Hono/Fastify) sans réécrire la logique.
