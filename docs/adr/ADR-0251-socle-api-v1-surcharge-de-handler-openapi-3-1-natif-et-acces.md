# ADR-0251 — Socle API v1 : surcharge de handler(), OpenAPI 3.1 natif et accès service de l'idempotence

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-201

## Contexte

SPEC-201 exige un wrapper handler(route, fn) fondé sur les contrats Zod, alors que SPEC-010 a livré handler(options, fn) utilisé par /health. Zod 4 produit du JSON Schema 2020-12, que OpenAPI 3.1 adopte tel quel. L'idempotence doit réserver la clé avant d'exécuter le service (serviceDb) et les tests ont besoin de vraies sessions Supabase.

## Décision

handler() est surchargé : une définition de route (id, method, path) passe par le wrapper de contrat, la forme à options de SPEC-010 reste inchangée. Le document OpenAPI utilise z.toJSONSchema cible draft-2020-12 sans conversion 3.0, est généré de façon déterministe et exclu de Prettier. Seul apps/web/lib/api/idempotency.ts (et les tests d'intégration) peut importer serviceDb dans apps/web, en dehors des pages de démonstration et des webhooks. Les tests obtiennent de vraies sessions via createTestSession de @learny/testing/supabase (API admin puis connexion par mot de passe, cookies @supabase/ssr). La version de package.json racine passe à 0.1.0, valeur de info.version.

## Conséquences

Les routes migrent vers handler(route, fn) au fil des spécifications ; SPEC-208 branche setRateLimiter et setOriginGuard ; les clés Supabase locales viennent de supabase status ou de l'environnement.
