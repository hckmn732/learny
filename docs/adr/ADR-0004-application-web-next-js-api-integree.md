# ADR-0004 — Application web Next.js, API intégrée

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, SPEC-006, SPEC-201

## Contexte

Un seul déploiement pour écrans, API et PWA ; pas de service d'API séparé en V1.

## Décision

`apps/web` : Next.js (App Router, React 19, Server Components), Tailwind CSS 4. API REST versionnée `/api/v1` en route handlers ; logique dans `packages/services`. Lecture des écrans par Server Components via les services ; mutations par l'API.

## Conséquences

L'API reste extractible plus tard (Hono/Fastify) sans réécrire la logique.
