// Owner-role reads of the SPEC-101 demonstration, kept under `_dev` so the ESLint boundary of
// ET-6 stays the only place allowed to use `serviceDb` outside the webhooks (SPEC-101, ADR-0049).
import { serviceDb, sql, userDb } from '@learny/db';
import { createTestUser, withRollback } from '@learny/db/testing';

export const EXTENSIONS = ['pgcrypto', 'vector', 'unaccent', 'pg_trgm'] as const;
export const ENUMS = {
  course_language: ['fr', 'en', 'es', 'de'],
  actor: ['tutor', 'learner', 'import'],
  content_origin: ['resource', 'tutor'],
  job_status: ['queued', 'running', 'done', 'failed'],
} as const;
export const ENUM_NAMES = Object.keys(ENUMS) as (keyof typeof ENUMS)[];

export const UNACCENT_SAMPLE = 'Écriture comptable';
export const UNACCENT_EXPECTED = 'Ecriture comptable';

export interface ExtensionRow {
  [key: string]: unknown;
  name: string;
  version: string;
}
export interface MigrationRow {
  [key: string]: unknown;
  version: string;
  name: string;
}
export interface FunctionRow {
  [key: string]: unknown;
  name: string;
  value: string | null;
}
export interface EnumRow {
  [key: string]: unknown;
  name: keyof typeof ENUMS;
  values: string[];
}
export interface Identity {
  [key: string]: unknown;
  uid: string | null;
  role: string;
}
export interface RlsDemo {
  userA: { id: string; identity: Identity };
  userB: { id: string; identity: Identity };
  service: Identity;
}
export interface Spec101Data {
  extensions: ExtensionRow[];
  migrations: MigrationRow[];
  functions: FunctionRow[];
  enums: EnumRow[];
  rls: RlsDemo;
}

async function extensionRows(): Promise<ExtensionRow[]> {
  return serviceDb().execute<ExtensionRow>(sql`
    select extname as name, extversion as version
    from pg_extension
    where extname in ('pgcrypto', 'vector', 'unaccent', 'pg_trgm')
  `);
}

async function migrationRows(): Promise<MigrationRow[]> {
  return serviceDb().execute<MigrationRow>(sql`
    select version, name
    from supabase_migrations.schema_migrations
    order by version
  `);
}

async function functionRows(): Promise<FunctionRow[]> {
  return serviceDb().execute<FunctionRow>(sql`
    select p.proname as name, null::text as value
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('set_updated_at', 'immutable_unaccent')
    union all
    select 'immutable_unaccent_sample', public.immutable_unaccent(${UNACCENT_SAMPLE})
  `);
}

async function enumRows(): Promise<EnumRow[]> {
  return serviceDb().execute<EnumRow>(sql`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname in ('course_language', 'actor', 'content_origin', 'job_status')
    group by t.typname
  `);
}

async function identityOf(userId: string): Promise<Identity> {
  return userDb({ userId }).run(async (tx) => {
    const rows = await tx.execute<Identity>(
      sql`select auth.uid()::text as uid, current_user as role`,
    );
    return rows[0] ?? { uid: null, role: 'unknown' };
  });
}

async function rlsDemo(): Promise<RlsDemo> {
  return withRollback(async (tx) => {
    const a = await createTestUser(tx);
    const b = await createTestUser(tx);
    const [identityA, identityB] = await Promise.all([identityOf(a.id), identityOf(b.id)]);
    const rows = await tx.execute<Identity>(
      sql`select auth.uid()::text as uid, current_user as role`,
    );
    return {
      userA: { id: a.id, identity: identityA },
      userB: { id: b.id, identity: identityB },
      service: rows[0] ?? { uid: null, role: 'unknown' },
    };
  });
}

export async function loadSpec101Demo(): Promise<Spec101Data> {
  const [extensions, migrations, functions, enums, rls] = await Promise.all([
    extensionRows(),
    migrationRows(),
    functionRows(),
    enumRows(),
    rlsDemo(),
  ]);
  return { extensions, migrations, functions, enums, rls };
}
