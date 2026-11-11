# `@learny/db` — schéma Drizzle, migrations et harnais de test

Paquet de fondation de la phase P1 (SPEC-101). Il fournit les deux clients d'accès à Postgres, la
configuration `drizzle-kit`, le miroir des migrations vers `supabase/migrations` et le harnais des
tests d'intégration. Aucune table métier n'est créée ici : SPEC-102 à SPEC-112 les ajoutent.

## API publique

| Export                       | Rôle                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceDb()`                | Client propriétaire (`postgres`), RLS non appliquée. Réservé aux jobs, webhooks, journal IA, seed et tests ; chaque usage porte `// service-role: <justification> (SPEC-xxx)`.                                               |
| `userDb({ userId, email? })` | Ouvre une transaction sous le rôle `authenticated` avec `request.jwt.claims` et `request.jwt.claim.sub` posés localement : `auth.uid()` et les politiques RLS s'appliquent. `userDb(ctx).run(fn)` renvoie la valeur de `fn`. |
| `closeDb()`                  | Ferme le pool partagé (tests, arrêt du worker). Idempotent.                                                                                                                                                                  |
| `Db`, `DbTx`, `UserContext`  | Types Drizzle du client et de ses transactions.                                                                                                                                                                              |
| `schema`                     | Barillet `@learny/db/schema` : `id()`, `timestamps()`, énumérations transverses.                                                                                                                                             |
| `sql`                        | Ré-export de `drizzle-orm` pour les requêtes brutes dans les paquets autorisés.                                                                                                                                              |

`userDb` rejette un identifiant non UUID avec `AppError('FORBIDDEN')` avant toute acquisition de
connexion. Le pool postgres.js utilise `prepare: false` (compatibilité pooler Supabase en mode
transaction), `idle_timeout: 20` et `connect_timeout: 10`, avec `DATABASE_POOL_MAX` connexions.
`DB_LOG_QUERIES=true` journalise la requête sans ses paramètres, jamais en production.

## Harnais de test (`@learny/db/testing`)

```ts
import { sql } from '@learny/db';
import { asUser, createTestUser, withRollback } from '@learny/db/testing';

it('lit les données de l’utilisateur', async () => {
  await withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex' });
    const rows = await asUser(tx, user.id, (inner) =>
      inner.execute(sql`select auth.uid()::text as uid`),
    );
    expect(rows[0]?.uid).toBe(user.id);
  });
});
```

- `withRollback(fn)` exécute `fn` dans une transaction `serviceDb` **toujours annulée** ; les
  écritures ne survivent pas au test. L'imbrication est refusée.
- `createTestUser(tx, opts)` insère directement dans `auth.users` (identifiant `gen_random_uuid()`,
  e-mail unique, métadonnées `first_name`/`last_name`/`timezone`).
- `asUser(tx, userId, fn)` pose un `SAVEPOINT`, les claims et `set local role authenticated`, puis
  `reset role` / `release savepoint`.
- `asService(tx, fn)` restaure le rôle propriétaire dans la transaction courante.
- `resetSequenceFreeIds()` est un point d'extension : les clés primaires sont des UUID, aucune
  séquence n'est à réinitialiser.

## Scripts

| Commande                         | Effet                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm db:generate`               | `drizzle-kit generate` depuis `src/schema/*.ts`, puis miroir vers `supabase/migrations/`. Sans changement : aucun fichier, code 0.         |
| `pnpm db:migration:custom <nom>` | Migration SQL vide `NNNN_<nom>.sql` pour fonctions, déclencheurs, politiques et index d'expression, puis miroir.                           |
| `pnpm db:check`                  | `drizzle-kit check` + comparaison SHA-256 des deux répertoires ; échoue sur fichier absent, différent ou orphelin. Appelé par `pnpm lint`. |
| `pnpm db:migrate`                | `supabase migration up --local` (les environnements distants passent par `tools/deploy`, SPEC-013).                                        |
| `pnpm db:reset --yes`            | Recrée la base locale, applique toutes les migrations et `supabase/seed.sql` (SPEC-008).                                                   |

`packages/db/migrations/` est la source de vérité. `supabase/migrations/2026111100NNNN_<nom>.sql` en
est une copie exacte (fins de ligne LF), générée par `scripts/sync-migrations.mjs`.

## Ajouter une migration

1. Modifier ou créer un fichier de `packages/db/src/schema/`.
2. `pnpm db:generate` (nommer si besoin : `pnpm --filter @learny/db generate -- --name <nom>`).
3. Pour le SQL non exprimable en Drizzle : `pnpm db:migration:custom <domaine>_<sujet>` puis remplir
   le fichier généré.
4. Ajouter `alter table public.<table> enable row level security;` dans la migration de création
   (ADR-0112) et le déclencheur `set_updated_at` si la table utilise `updated_at` (vérifié par
   `[SPEC-101] conventions de schéma`).
5. `pnpm db:reset --yes && pnpm test:int -t SPEC-101`, puis `pnpm db:check`.
6. Ne jamais modifier une migration fusionnée dans `main` : ajouter une nouvelle migration.

## Extensions et fonctions partagées

`0000_extensions_and_shared.sql` crée le schéma `extensions` et les extensions `pgcrypto`, `vector`,
`unaccent`, `pg_trgm`, ainsi que `public.set_updated_at()` et `public.immutable_unaccent(text)`.
Tout index d'expression utilisant `unaccent` doit passer par `public.immutable_unaccent` (ADR-0111).
