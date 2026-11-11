---
id: SPEC-101
title: Paquet db : Drizzle, migrations et harnais de test
phase: P1
priority: V1
depends_on: [SPEC-008]
business_rules: []
screens: []
adrs: [ADR-0006, ADR-0022, ADR-0047, ADR-0049, ADR-0110, ADR-0111, ADR-0112]
visual: demo
---

# SPEC-101 — Paquet db : Drizzle, migrations et harnais de test

## 1. Objectif

Livrer le paquet `@learny/db` : clients Drizzle (`userDb` soumis à la Row Level Security, `serviceDb` réservé au service), configuration `drizzle-kit`, flux de migration vers `supabase/migrations`, extensions Postgres, fonctions SQL partagées (`set_updated_at`, `immutable_unaccent`), énumérations transverses, et le harnais de test (`withRollback`, `createTestUser`, `asUser`) sur lequel reposent toutes les spécifications SPEC-102 à SPEC-115.

## 2. Contexte

Toute la phase P1 construit le schéma décrit dans `docs/architecture/data-model.md` (contrat principal). Cette spécification pose l'outillage commun ; elle ne crée **aucune table métier**. Documents à lire : `docs/architecture/data-model.md` (préambule « Conventions »), `docs/architecture/overview.md` §3 (frontières de paquets : `db` n'importe que `core` et `config`), `docs/engineering/conventions.md` §7 (deux clients, transactions, migrations immuables), `docs/engineering/testing.md` §3 (base locale, `withRollback`), ADR-0006 (Supabase, extensions), ADR-0022 (RLS partout), ADR-0110 (clients), ADR-0111 (flux de migrations), ADR-0112 (RLS dès la création).

## 3. Dépendances

- **SPEC-008** (`done`) : `supabase/config.toml`, Supabase CLI locale (Postgres sur `127.0.0.1:54322`), scripts `pnpm dev:up`, `pnpm db:reset`, `pnpm db:seed:demo` (ce dernier est complété par SPEC-115). Transitivement SPEC-001 (monorepo, Vitest projets `unit`/`integration`, Playwright), SPEC-004 (`@learny/testing`, horloge figée), SPEC-006 (pages `/_dev/sdd/[specId]`), SPEC-009 (`@learny/config` : `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`).
- **Bibliothèques** (dernières stables, majeures minimales `docs/engineering/conventions.md` §1) : `drizzle-orm` ≥ 0.44, `drizzle-kit` (version compatible), `postgres` (postgres.js) ≥ 3.4, `zod` 4 (déjà présent), `uuid` ≥ 11 (v5 pour SPEC-115).
- **Services** : Supabase CLI locale (Docker). Si Docker est indisponible, les tests d'intégration échouent explicitement avec le message `Base locale injoignable : lancer pnpm dev:up` ; aucun mode simulé de la base n'est autorisé (la RLS ne se simule pas). Ce cas est un blocage externe à consigner par `node tools/sdd/fail.mjs SPEC-101 "…" --external`.
- **Variables** : `DATABASE_URL` (local : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), `DATABASE_POOL_MAX` (défaut `10`), `DB_LOG_QUERIES` (défaut `false`). Les deux dernières sont ajoutées au schéma de `@learny/config` et à `.env.example`.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est portée par cette spécification (catalogue : liste vide). Elle prépare techniquement l'exigence de sécurité transverse « isolation des données par Row Level Security » détaillée par SPEC-113, en fournissant le client `userDb` qui exécute toute requête applicative sous le rôle `authenticated` avec l'identité de l'utilisateur.

## 5. Exigences fonctionnelles

- **EF-1** — `pnpm db:generate` génère, depuis `packages/db/src/schema/*.ts`, une migration SQL dans `packages/db/migrations/` puis la recopie dans `supabase/migrations/` sous le nom `2026111100NNNN_<nom>.sql` (NNNN = numéro Drizzle sur 4 chiffres). Sans changement de schéma, la commande ne crée aucun fichier et se termine avec le code 0.
- **EF-2** — `pnpm db:migration:custom <nom>` crée une migration SQL vide `NNNN_<nom>.sql` (via `drizzle-kit generate --custom --name=<nom>`) pour le SQL non exprimable en Drizzle (fonctions, déclencheurs, politiques, index d'expression), puis la synchronise.
- **EF-3** — `pnpm db:check` échoue (code 1) si `packages/db/migrations/*.sql` et `supabase/migrations/*.sql` divergent (fichier manquant ou contenu différent, comparaison SHA-256) ou si `drizzle-kit check` signale une incohérence du journal. Il est appelé par `pnpm lint`.
- **EF-4** — `pnpm db:reset` (défini par SPEC-008) applique toutes les migrations sur une base vide puis `supabase/seed.sql` (minimal, vide de données à ce stade) sans erreur.
- **EF-5** — `pnpm db:migrate` applique les migrations en attente sur la base locale (`supabase migration up --local`) ; en environnement distant, l'application est faite par `tools/deploy` (SPEC-013), hors périmètre.
- **EF-6** — Après migration, la base contient les extensions `pgcrypto`, `vector`, `unaccent`, `pg_trgm` (schéma `extensions`), les fonctions `public.set_updated_at()` et `public.immutable_unaccent(text)` et les énumérations transverses `course_language`, `actor`, `content_origin`, `job_status`.
- **EF-7** — La page `/_dev/sdd/SPEC-101` affiche l'état de la base (extensions, migrations appliquées, fonctions, énumérations) et le résultat d'une démonstration d'identité RLS (§10).

## 6. Exigences techniques

- **ET-1 — Arborescence** :
  ```
  packages/db/
    package.json            name @learny/db ; exports "." (src/index.ts), "./schema" (src/schema/index.ts), "./testing" (src/testing/index.ts)
    drizzle.config.ts       dialect postgresql, schema ./src/schema/index.ts, out ./migrations, casing snake_case, strict true, verbose true
    migrations/             SQL générés (+ meta/_journal.json, snapshots) — jamais édités après fusion
    scripts/sync-migrations.mjs
    scripts/check-migrations.mjs
    src/index.ts            exporte createUserDb, userDb, serviceDb, closeDb, types Db, DbTx, UserContext
    src/client.ts
    src/schema/index.ts     réexporte tous les fichiers de schéma
    src/schema/enums.ts     énumérations transverses
    src/schema/columns.ts   helpers de colonnes (id, timestamps, userIdRef)
    src/testing/index.ts    withRollback, createTestUser, asUser, resetSequenceFreeIds
    test/integration/       tests d'intégration
  ```
- **ET-2 — Helpers de colonnes** (`src/schema/columns.ts`) :
  ```ts
  export const id = () => uuid('id').primaryKey().defaultRandom();          // gen_random_uuid()
  export const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
  export const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
  export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });
  ```
  Toute table qui utilise `updatedAt()` reçoit dans la migration personnalisée de sa spécification le déclencheur `create trigger set_updated_at before update on public.<table> for each row execute function public.set_updated_at();`. Un test générique (CL-6) le vérifie.
- **ET-3 — Énumérations transverses** (`src/schema/enums.ts`, `pgEnum`) :
  - `course_language` : `fr`, `en`, `es`, `de` ;
  - `actor` : `tutor`, `learner`, `import` ;
  - `content_origin` : `resource`, `tutor` ;
  - `job_status` : `queued`, `running`, `done`, `failed`.
  Les autres énumérations sont déclarées par la spécification du domaine qui les introduit (ADR-0113). Chaque énumération est aussi exportée comme tableau TypeScript constant (`COURSE_LANGUAGES = courseLanguage.enumValues`).
- **ET-4 — Migration personnalisée `extensions_and_shared`** (première migration, `0000_extensions_and_shared.sql`, créée par EF-2 puis complétée ; les énumérations de ET-3 sont générées dans la migration Drizzle suivante `0001_shared_enums.sql`) :
  ```sql
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
  create extension if not exists vector with schema extensions;
  create extension if not exists unaccent with schema extensions;
  create extension if not exists pg_trgm with schema extensions;

  create or replace function public.set_updated_at() returns trigger
    language plpgsql as $$
  begin
    new.updated_at := now();
    return new;
  end $$;

  create or replace function public.immutable_unaccent(text) returns text
    language sql immutable parallel safe strict
    set search_path = ''
    as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;
  ```
  `immutable_unaccent` est obligatoire pour tout index d'expression utilisant `unaccent` (FTS SPEC-103, SPEC-112) car `unaccent` n'est pas `IMMUTABLE`.
- **ET-5 — Clients** (`src/client.ts`, ADR-0110) :
  ```ts
  export type UserContext = { userId: string; email?: string };
  export type Db = PostgresJsDatabase<typeof schema>;
  export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];
  export function serviceDb(): Db;                       // singleton ; connexion DATABASE_URL (rôle postgres, propriétaire des tables, RLS non appliquée)
  export function userDb(ctx: UserContext): { run<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> };
  export async function closeDb(): Promise<void>;        // ferme le pool (tests, arrêt du worker)
  ```
  `userDb(ctx).run(fn)` ouvre une transaction et exécute **avant** `fn` :
  ```sql
  select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true);
  set local role authenticated;
  ```
  où `$1 = JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', email })`. Ainsi `auth.uid()` renvoie `userId` et toutes les politiques RLS s'appliquent. Le pool postgres.js est créé avec `{ max: DATABASE_POOL_MAX, prepare: false, idle_timeout: 20, connect_timeout: 10 }` ; `prepare: false` assure la compatibilité avec le pooler Supabase en mode transaction. `userId` est validé (`z.uuid()`) : une valeur invalide lève `AppError('FORBIDDEN')` avant toute requête.
- **ET-6 — Règles d'usage** : `serviceDb()` n'est importable que par `packages/services`, `packages/jobs`, `packages/llm` (journal `ai_calls`), `packages/testing` et `packages/db/src/testing` ; une règle ESLint `no-restricted-imports` dans `apps/web` interdit `serviceDb` hors de `apps/web/app/_dev/**` et `apps/web/app/api/webhooks/**`. Chaque usage de `serviceDb()` dans un service porte un commentaire `// service-role: <justification> (SPEC-xxx)`.
- **ET-7 — Harnais de test** (`src/testing/index.ts`) :
  ```ts
  export async function withRollback<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;   // transaction serviceDb annulée à la fin (erreur sentinelle RollbackSignal), renvoie la valeur de fn
  export async function createTestUser(tx: DbTx, opts?: { email?: string; firstName?: string; lastName?: string; timezone?: string }): Promise<{ id: string; email: string }>;
  export async function asUser<T>(tx: DbTx, userId: string, fn: (tx: DbTx) => Promise<T>): Promise<T>; // SAVEPOINT + claims + set local role authenticated, puis RESET ROLE et RELEASE
  export async function asService<T>(tx: DbTx, fn: (tx: DbTx) => Promise<T>): Promise<T>;             // reset role (rôle propriétaire)
  ```
  `createTestUser` insère directement dans `auth.users` (`id = gen_random_uuid()`, `instance_id = '00000000-0000-0000-0000-000000000000'`, `aud = 'authenticated'`, `role = 'authenticated'`, `email = opts.email ?? 'user-<8 hex>@test.learny.test'`, `email_confirmed_at = now()`, `raw_user_meta_data = { first_name, last_name, timezone }`, `raw_app_meta_data = { provider: 'email', providers: ['email'] }`) : à partir de SPEC-102, le déclencheur d'inscription crée alors le profil et les lignes par défaut dans la même transaction. `asUser` est implémenté par `SAVEPOINT as_user_<n>` / `set local role authenticated` / `set_config(..., true)` et restaure le rôle par `reset role` dans un `finally`.
- **ET-8 — Scripts** :
  - `packages/db/package.json` : `generate` = `drizzle-kit generate && node scripts/sync-migrations.mjs` ; `migration:custom` = `drizzle-kit generate --custom --name` suivi de la synchronisation ; `check` = `drizzle-kit check && node scripts/check-migrations.mjs` ; `test:int` via le projet Vitest `integration`.
  - Racine : `db:generate` → `pnpm --filter @learny/db generate` ; `db:migration:custom` → `pnpm --filter @learny/db migration:custom` ; `db:migrate` → `supabase migration up --local` ; `db:check` → `pnpm --filter @learny/db check` ; `lint` inclut `db:check`.
  - `sync-migrations.mjs` : pour chaque `packages/db/migrations/NNNN_<nom>.sql`, écrit `supabase/migrations/2026111100NNNN_<nom>.sql` (contenu identique, fin de ligne LF) ; supprime de `supabase/migrations/` tout fichier `2026111100*` sans source ; n'écrit pas si le contenu est identique (idempotent).
- **ET-9 — Sécurité** : aucune chaîne de connexion ni clé n'est journalisée ; `DB_LOG_QUERIES=true` active le logger Drizzle en développement uniquement (refusé si `NODE_ENV=production`) et masque les paramètres.
- **ET-10 — Performance** : ouverture d'une transaction `userDb` + requête triviale < 15 ms p95 en local (mesurée dans le test d'intégration, 50 itérations, consignée dans `evidence/SPEC-101/`).

## 7. Comportements attendus et cas limites

- **CL-1** — `userDb` avec un `userId` non UUID → `AppError` code `FORBIDDEN`, aucune connexion utilisée.
- **CL-2** — Exception levée dans `fn` de `userDb(ctx).run` → transaction annulée, l'exception est relancée telle quelle ; le rôle et les claims ne fuient pas vers la requête suivante (paramètres `local`, vérifié en enchaînant deux `run` avec deux utilisateurs différents sur la même connexion `max: 1`).
- **CL-3** — `withRollback` imbriqué dans un autre `withRollback` → refusé (`Error('withRollback ne peut pas être imbriqué')`).
- **CL-4** — Migration en double (même contenu, nom différent) dans `supabase/migrations/` → `db:check` échoue avec la liste des fichiers orphelins.
- **CL-5** — Base locale arrêtée → `serviceDb()` échoue à la première requête avec une erreur dont le message contient `pnpm dev:up` ; les tests d'intégration ne sont pas marqués réussis.
- **CL-6** — Table possédant une colonne `updated_at` sans déclencheur `set_updated_at` → le test générique `[SPEC-101] chaque table avec updated_at a son déclencheur` (requête sur `information_schema.columns` × `pg_trigger`) échoue en nommant la table. Ce test reste actif pour toutes les spécifications suivantes.
- **CL-7** — Exécution de `pnpm db:generate` deux fois de suite → aucun nouveau fichier ; `git status` propre.
- **CL-8** — Requête concurrente de deux utilisateurs (`Promise.all` de 20 `userDb(...).run` alternés) → chaque transaction voit son propre `auth.uid()` (aucune contamination de contexte).

## 8. Instructions d'implémentation

1. Créer `packages/db/package.json` (nom `@learny/db`, `type: module`, exports ET-1, dépendances `drizzle-orm`, `postgres`, `zod`, `@learny/config`, `@learny/core` ; dev : `drizzle-kit`, `uuid`).
2. Écrire `drizzle.config.ts` (ET-1) lisant `DATABASE_URL` via `@learny/config`.
3. Écrire `src/schema/columns.ts`, `src/schema/enums.ts` (ET-2, ET-3) et `src/schema/index.ts`.
4. `pnpm db:migration:custom extensions_and_shared` puis remplir le fichier avec ET-4 ; `pnpm db:generate --name shared_enums` pour les énumérations.
5. Écrire `scripts/sync-migrations.mjs` et `scripts/check-migrations.mjs` (ET-8) ; ajouter les scripts racine ; brancher `db:check` dans `lint`.
6. Écrire `src/client.ts` (ET-5) et `src/index.ts` ; ajouter `DATABASE_POOL_MAX`, `DB_LOG_QUERIES` dans `@learny/config` et `.env.example`.
7. Ajouter la règle ESLint ET-6.
8. Écrire `src/testing/index.ts` (ET-7). `createTestUser` doit fonctionner avant SPEC-102 (pas de profil créé) comme après.
9. Écrire les tests unitaires et d'intégration (§12), lancer `pnpm db:reset && pnpm test:int -t SPEC-101`.
10. Écrire la page `apps/web/app/_dev/sdd/SPEC-101/page.tsx` (Server Component, `serviceDb` autorisé sous `_dev`) et le test e2e.
11. Commits suggérés : `build(SPEC-101): crée le paquet db et la configuration drizzle-kit` ; `feat(SPEC-101): ajoute extensions, fonctions partagées et énumérations` ; `feat(SPEC-101): ajoute les clients userDb et serviceDb` ; `feat(SPEC-101): ajoute la synchronisation des migrations` ; `test(SPEC-101): ajoute le harnais et les tests de la base` ; `feat(SPEC-101): ajoute la page de démonstration`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/**` (ET-1), `packages/db/migrations/0000_extensions_and_shared.sql`, `packages/db/migrations/0001_shared_enums.sql`, `supabase/migrations/20261111000000_extensions_and_shared.sql`, `supabase/migrations/20261111000001_shared_enums.sql`, `apps/web/app/_dev/sdd/SPEC-101/page.tsx`, `apps/web/e2e/specs/p1/spec-101-db.spec.ts`, `packages/db/src/client.test.ts`, `packages/db/test/integration/db-harness.test.ts`, `packages/db/test/integration/conventions.test.ts`, `packages/db/README.md`.
- **Modifiés** : `package.json` racine (scripts ET-8), `packages/config/src/env.ts` et `.env.example` (variables), `eslint.config.js` (ET-6), `vitest.workspace.ts` (inclusion de `packages/db/test/integration`).
- **Lus / réutilisés** : `@learny/config` (env), `@learny/core` (`AppError`, logger), `@learny/testing` (horloge, helpers Playwright), `supabase/config.toml`.

## 10. Interface et conformité visuelle

Mode `demo` (ADR-0049). Page `/_dev/sdd/SPEC-101`, rendue uniquement si `ENABLE_SDD_PAGES=true` :
- Titre `h1` « SPEC-101 · Paquet db » (`data-testid="sdd-title"`).
- Carte « Extensions » (`data-testid="db-extensions"`) : tableau nom / version pour `pgcrypto`, `vector`, `unaccent`, `pg_trgm`.
- Carte « Migrations appliquées » (`data-testid="db-migrations"`) : liste de `supabase_migrations.schema_migrations` (version, nom), nombre total.
- Carte « Fonctions partagées » (`data-testid="db-functions"`) : `set_updated_at`, `immutable_unaccent` avec résultat de `immutable_unaccent('Écriture comptable')` = `Ecriture comptable`.
- Carte « Énumérations » (`data-testid="db-enums"`) : les 4 énumérations et leurs valeurs.
- Carte « Identité RLS » (`data-testid="db-rls-identity"`) : dans un `withRollback`, création de deux utilisateurs de test A et B, puis affichage de `auth.uid()` et `current_user` vus par `userDb` pour A et B (attendu : `authenticated`, identifiants distincts égaux aux UUID créés) et par `serviceDb` (`postgres`, `auth.uid()` nul). Chaque ligne affiche un badge « Conforme » / « Non conforme » (`data-testid="check-<clé>"`).
- Mise en page : composants `@learny/ui` disponibles (sinon HTML sémantique avec jetons de SPEC-301 si livré, sinon styles du gabarit `/_dev/sdd` de SPEC-006) ; aucun écran maquetté.
- Contrôles visuels (testing.md §6, contrôles 1, 2, 4) : jetons de fond et police de la page `/_dev/sdd` ; structure (5 cartes dans l'ordre ci-dessus) ; ligne de base `toHaveScreenshot('spec-101-demo.png', { maxDiffPixelRatio: 0.01 })` avec masquage des colonnes variables (UUID, versions).

## 11. Critères d'acceptation

- **CA-1** — Après `pnpm db:reset`, les 4 extensions, les 2 fonctions et les 4 énumérations existent (test d'intégration « catalogue »).
- **CA-2** — `userDb` exécute sous `current_user = 'authenticated'` avec `auth.uid()` égal à l'utilisateur ; `serviceDb` sous `postgres` ; aucune fuite de contexte entre transactions successives ni concurrentes (CL-2, CL-8).
- **CA-3** — `withRollback` annule toute écriture (un utilisateur créé dans `withRollback` n'existe plus après), `createTestUser` et `asUser` fonctionnent.
- **CA-4** — `pnpm db:generate` est idempotent et `pnpm db:check` détecte une divergence entre `packages/db/migrations` et `supabase/migrations` (test sur un répertoire temporaire).
- **CA-5** — `immutable_unaccent('Équilibre d’une pièce')` renvoie `Equilibre d’une piece` et est utilisable dans un index d'expression (création d'un index temporaire réussie).
- **CA-6** — La page `/_dev/sdd/SPEC-101` affiche les 5 cartes, toutes les vérifications « Conforme », filmée par le test e2e ; contrôle `@visual` réussi.
- **CA-7** — Latence `userDb` p95 < 15 ms sur 50 itérations (mesure consignée).

## 12. Plan de tests

- **Unitaires** — `packages/db/src/client.test.ts`, `describe('[SPEC-101] clients db')` : construction des claims JSON (sub, role, aud) ; rejet d'un `userId` non UUID (CL-1) ; `scripts/sync-migrations.mjs` testé via fonction pure `planSync(sourceFiles, targetFiles)` → liste d'écritures/suppressions (cas : nouveau fichier, fichier identique, orphelin) ; `checkMigrations` → erreur sur divergence (CA-4).
- **Intégration** (base Supabase locale réelle) — `packages/db/test/integration/db-harness.test.ts`, `describe('[SPEC-101] harnais et clients')` : catalogue (CA-1) ; identité `userDb`/`serviceDb` (CA-2) ; contexte non partagé entre deux `run` successifs et 20 `run` concurrents (CL-2, CL-8) ; `withRollback` + `createTestUser` + `asUser` (CA-3) ; imbrication refusée (CL-3) ; `immutable_unaccent` + index temporaire (CA-5) ; mesure de latence (CA-7). `packages/db/test/integration/conventions.test.ts`, `describe('[SPEC-101] conventions de schéma')` : chaque table `public` avec `updated_at` a le déclencheur `set_updated_at` (CL-6) ; chaque colonne `created_at` est `timestamptz not null default now()`.
- **End-to-end** — `apps/web/e2e/specs/p1/spec-101-db.spec.ts`, `test('page de démonstration du paquet db @SPEC-101', …)` : `pnpm db:reset` effectué par le `globalSetup` ; ouvrir `/_dev/sdd/SPEC-101` ; vérifier les 5 cartes, les 4 extensions, la valeur `Ecriture comptable`, tous les badges `Conforme` ; vidéo enregistrée.
- **Visuel** — `test('page db conforme @SPEC-101 @visual', …)` : `expectTokens` (fond, police Inter, couleur du titre) ; ordre des cartes ; `toHaveScreenshot` (masques sur UUID et versions).
- **Non-régression** — rejouer `@SPEC-001`, `@SPEC-006`, `@SPEC-008` et `[SPEC-004]`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | intégration « catalogue » |
| CA-2 | intégration « identité », « contexte non partagé » |
| CA-3 | intégration « withRollback/createTestUser/asUser » |
| CA-4 | unitaires `planSync`, `checkMigrations` |
| CA-5 | intégration « immutable_unaccent » |
| CA-6 | e2e `@SPEC-101`, visuel `@SPEC-101 @visual` |
| CA-7 | intégration « latence » |

## 13. Preuves attendues

`evidence/SPEC-101/` : vidéo du test e2e (page de démonstration), capture `screenshots/spec-101-demo.png`, `integration.json` avec la mesure de latence (p50/p95) recopiée dans `summary.md`, sortie de `pnpm db:check` (OK) dans `checks.json`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) et, en plus : `pnpm db:reset` passe depuis une base vide ; `supabase/migrations/` et `packages/db/migrations/` sont synchronisés ; `packages/db/README.md` documente les deux clients, les scripts et la procédure « ajouter une migration ».

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0006 (Supabase, extensions), ADR-0022 (RLS partout), ADR-0047 (aucun `new Date()` hors horloge : les valeurs par défaut temporelles sont produites par Postgres `now()`), ADR-0049 (page de démonstration).
- Décisions prises et consignées : **ADR-0110** (clients `userDb`/`serviceDb`, claims par transaction, `prepare: false`) ; **ADR-0111** (flux `drizzle-kit` → `supabase/migrations`, préfixe `2026111100NNNN`, migrations personnalisées, `immutable_unaccent`) ; **ADR-0112** (RLS activée à la création de chaque table, politiques ajoutées par SPEC-113).
- Hypothèse : le rôle `postgres` de Supabase est propriétaire des tables `public` et n'est pas soumis à la RLS (aucune table n'utilise `force row level security`) ; c'est ce qui fonde `serviceDb`.
