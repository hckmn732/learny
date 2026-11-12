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

### Programme d'une formation (SPEC-103)

`createTestProgramme(tx, ownerId, { modules, chaptersPerModule, notionsPerChapter })` insère une
formation `active` et son programme ordonné (modules, chapitres, notions) dans la transaction
courante. Les positions commencent à 1 et les clés étrangères composites garantissent qu'une notion
appartient bien au chapitre et au module de sa formation. La fabrique est destinée à
`withRollback` ; SPEC-115 l'enrichit pour le jeu de démonstration.

### Embeddings factices (SPEC-104)

`fakeEmbedding(text)` renvoie un vecteur déterministe de 1 024 composantes (ADR-0056, mode `mock`) :
les composantes viennent de blocs SHA-256 du texte, ramenées dans `[-1, 1]` puis normalisées en
norme L2. Même texte → même vecteur, textes différents → vecteurs différents. `toVectorLiteral()`
produit la forme texte `[0.1,…]` acceptée par un cast `extensions.vector`. La règle est réutilisée
par l'ingestion (SPEC-509) et la recherche (SPEC-511) en mode simulé.

### Ressources et passages (SPEC-104)

`resources` porte les apports et suggestions avec `status`, `metadata` et suppression logique ;
`resource_chunks` porte les passages repérés (`location` : page, horodatage, ancre, caractères) et
l'embedding `vector(1024)` indexé en HNSW cosinus (`m = 16`, `ef_construction = 64`). Les limites
de BR-APP-02 et les formes par type sont imposées en base ; la suppression logique efface le
contenu et les passages mais conserve la ligne pour les citations. `createTestProgramme` fournit la
formation et le chapitre nécessaires aux tests d'intégration.

### Cours et discussions (SPEC-105)

`courses` stocke une version par `(owner_id, module_id)` : l'index partiel unique
`courses_one_current_idx` garantit une seule version courante et le déclencheur
`courses_single_current` bascule les autres versions à `is_current = false` à chaque insertion
(BR-COU-10). `course_sections` porte le contenu ordonné et ancré du cours ; `citations` référence
le passage et la ressource cités, mis à `null` à leur suppression alors que la citation est
conservée (« source supprimée », ADR-0039). `reading_progress` et `chapter_summaries` référencent
la version lue ; `tutor_conversations` et `tutor_messages` gardent une discussion privée par
ouverture (ADR-0040). `createTestCourse(tx, { ownerId, moduleId, sectionsPerChapter })` crée une
version prête et ses sections sur les chapitres du module.

#### Auteur d'une correction (`learny.actor`)

Toute mise à jour de `title`, `content_md` ou `data` d'une section archive l'état précédent dans
`course_section_revisions` et incrémente `course_sections.version` (EF-4). Le déclencheur lit
`current_setting('learny.actor', true)` pour renseigner `edited_by` : `tutor` par défaut, `learner`
lorsqu'un service applique une correction de l'apprenant. Le service positionne la variable dans sa
transaction avant l'écriture :

```sql
select set_config('learny.actor', 'learner', true); -- portée transactionnelle
update public.course_sections set content_md = $1 where id = $2;
```

`reported` peut changer sans créer de révision. La migration `courses_rules` active aussi la RLS
sur les huit tables (ADR-0112), la cohérence propriétaire (`owner_mismatch`, 23514) et
l'horodatage de la discussion à chaque message.

### Briques, activités et tentatives (SPEC-106)

`bricks` porte les treize types de BR-BRI-01, leur objectif, leur statut et leur version courante ;
`brick_versions` conserve chaque payload (le déclencheur `brick_versions_immutable` refuse toute
réécriture) et `brick_reports` garde le motif et la résolution. `activities` assemble des versions
ordonnées ; le garde transactionnel `assert_activity_items_owned` et le déclencheur
`activities_ready_items` refusent, avant tout commit, une version absente, une brique signalée ou
retirée, une brique d'un autre propriétaire ou d'une autre formation (BR-BRI-06, ADR-0021,
ADR-0240). `attempts` numérote les essais par activité et apprenant, `answers` fige la
`brick_version_id` présentée : publier une version plus récente ne réécrit jamais les réponses
passées (ADR-0241).

Les repositories de `packages/db/src/repositories/activities.ts` valident les JSON (Zod) puis
écrivent dans la transaction de l'appelant : `createActivity`, `setActivityStatus`,
`addBrickVersion`, `createAttempt` (numérotation sérialisée), `recordAnswer` et
`getAttemptWithAnswers`. Les six tables ont RLS activée et des politiques propriétaire minimales ;
SPEC-113 livrera la matrice complète.

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
