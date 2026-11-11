# ADR-0110 — Clients Drizzle userDb et serviceDb

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-101, SPEC-113

## Contexte

`docs/engineering/conventions.md` §7 impose deux clients (`userDb(ctx)` soumis à la RLS, `serviceDb()` réservé au service) sans préciser comment Drizzle transmet l'identité de l'utilisateur à Postgres.

## Décision

Un seul pool postgres.js (`DATABASE_URL`, `prepare: false`, `max = DATABASE_POOL_MAX`, défaut 10). `serviceDb()` exécute les requêtes avec le rôle de connexion (`postgres`, propriétaire des tables, RLS non appliquée). `userDb(ctx).run(fn)` ouvre une transaction, positionne `request.jwt.claims` (`{ sub, role: 'authenticated', aud: 'authenticated', email }`) et `request.jwt.claim.sub` par `set_config(..., true)`, puis `set local role authenticated` avant d'exécuter `fn` : `auth.uid()` et les politiques RLS s'appliquent. Toute requête applicative passe par `userDb` ; `serviceDb` est limité aux jobs, webhooks, journal IA, seed et tests, chaque usage étant justifié par un commentaire `// service-role:`.

## Conséquences

Les lectures et écritures d'écran sont isolées par la base même en cas de bug applicatif ; une requête `userDb` coûte une transaction (budget < 15 ms p95 en local).
