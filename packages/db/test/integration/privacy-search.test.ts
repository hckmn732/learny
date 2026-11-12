// Integration tests of the personal-data, idempotency, rate-limit and private-search schema
// (SPEC-112 §12): introspection, SQL constraints, export expiration, legal history, idempotency
// replay/conflict/concurrency, atomic rate-limit consumption, FTS accent/typo, current course and
// reported section exclusion, two real JWTs, RLS isolation and the query plan.
// Every test runs against the local Supabase database (testing.md §3) with the fixed clock of
// ADR-0047 (2026-11-11T12:20:00Z).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  completeIdempotencyKey,
  consumeRateLimit,
  deleteExpiredIdempotencyKeys,
  deleteStaleRateLimits,
  getIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
  upsertRateLimit,
} from '../../src/repositories/idempotency';
import {
  canDownloadDataExport,
  completeDataExport,
  createDataExport,
  failDataExport,
  getDataExport,
  latestLegalAcceptance,
  listDataExports,
  listLegalAcceptances,
  recordLegalAcceptance,
} from '../../src/repositories/privacy';
import { groupSearchResults, searchUserContent } from '../../src/repositories/search';
import {
  createTestCourse,
  createTestProgramme,
  createTestUser,
  withRollback,
} from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const FIXED = new Date('2026-11-11T12:20:00Z');
const HOUR = 60 * 60 * 1000;
const TABLES = ['data_exports', 'idempotency_keys', 'legal_acceptances', 'rate_limits'];

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec112_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

async function failureOfUserDb(
  fn: (tx: DbTx) => Promise<unknown>,
  userId: string,
): Promise<Failure> {
  try {
    await userDb({ userId }).run(fn);
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

/** Awaits a promise that must fail and reports its stable code and messages. */
async function rejected(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise;
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

async function count(tx: Queryable, table: string, column: string, value: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(column)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

interface RichFixture {
  userId: string;
  formationId: string;
  moduleId: string;
  chapterId: string;
  notionId: string;
  currentSectionId: string;
  oldSectionId: string;
  reportedSectionId: string;
}

interface RichOptions {
  title: string;
  description: string;
  notionLabel: string;
  notionDefinition: string;
  sectionTitle: string;
  sectionContent: string;
}

/**
 * Creates a learner with a programme, a superseded course version and a current version holding a
 * searchable section plus a reported one. The caller's transaction decides whether it commits.
 */
async function createRichFixture(tx: DbTx, options: RichOptions): Promise<RichFixture> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 2,
    title: options.title,
  });
  const moduleId = programme.moduleIds[0];
  const chapterId = programme.chapterIds[0];
  const notionId = programme.notionIds[0];
  if (moduleId === undefined || chapterId === undefined || notionId === undefined) {
    throw new Error('programme de test incomplet');
  }

  await tx.execute(sql`
    update public.formations set description = ${options.description}
    where id = ${programme.formationId}::uuid
  `);
  await tx.execute(sql`
    update public.notions
    set label = ${options.notionLabel}, short_definition = ${options.notionDefinition}
    where id = ${notionId}::uuid
  `);

  // Version 1 is created by the factory; it becomes non-current when version 2 is inserted.
  const oldCourse = await createTestCourse(tx, {
    ownerId: user.id,
    moduleId,
    sectionsPerChapter: 1,
  });
  const oldSectionId = oldCourse.sectionIds[0];
  if (oldSectionId === undefined) throw new Error('section ancienne absente');
  await tx.execute(sql`
    update public.course_sections
    set title = 'Ancienne version', content_md = 'La trésorerie ancienne version doit disparaître.'
    where id = ${oldSectionId}::uuid
  `);

  const [current] = await tx.execute<{ id: string }>(sql`
    insert into public.courses (owner_id, formation_id, module_id, version, status)
    values (${user.id}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid, 2, 'ready')
    returning id::text as id
  `);
  if (current === undefined) throw new Error('version courante non créée');

  const [currentSection] = await tx.execute<{ id: string }>(sql`
    insert into public.course_sections (
      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin, reported
    )
    values (
      ${current.id}::uuid, ${user.id}::uuid, ${chapterId}::uuid, 1, 'text', 'courant-1',
      ${options.sectionTitle},
      ${`<script>alert('x')</script>${options.sectionContent} <b>Texte sûr</b>`},
      'tutor', false
    )
    returning id::text as id
  `);
  const [reported] = await tx.execute<{ id: string }>(sql`
    insert into public.course_sections (
      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin, reported
    )
    values (
      ${current.id}::uuid, ${user.id}::uuid, ${chapterId}::uuid, 2, 'text', 'signale-1',
      'Section signalée', 'La trésorerie signalée ne doit pas sortir.', 'tutor', true
    )
    returning id::text as id
  `);
  if (currentSection === undefined || reported === undefined) {
    throw new Error('sections courantes non créées');
  }

  return {
    userId: user.id,
    formationId: programme.formationId,
    moduleId,
    chapterId,
    notionId,
    currentSectionId: currentSection.id,
    oldSectionId,
    reportedSectionId: reported.id,
  };
}

const ALICE_OPTIONS: RichOptions = {
  title: 'SAP S/4HANA Finance',
  description: 'Formation à la trésorerie et au budget.',
  notionLabel: 'Trésorerie prévisionnelle',
  notionDefinition: 'Le plan de trésorerie anticipe les encaissements et les décaissements.',
  sectionTitle: 'Le cycle de trésorerie',
  sectionContent: 'La trésorerie suit les encaissements.',
};

const BOB_OPTIONS: RichOptions = {
  title: 'Trésorerie confidentielle de Bob',
  description: 'Notes privées de Bob sur la trésorerie.',
  notionLabel: 'Trésorerie de Bob',
  notionDefinition: 'Contenu de trésorerie appartenant à Bob.',
  sectionTitle: 'Le secret de Bob',
  sectionContent: 'La trésorerie de Bob est confidentielle.',
};

async function seedSearchFixtures(): Promise<{ alice: RichFixture; bob: RichFixture }> {
  return serviceDb().transaction(async (tx) => ({
    alice: await createRichFixture(tx, ALICE_OPTIONS),
    bob: await createRichFixture(tx, BOB_OPTIONS),
  }));
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-112] privacy search SQL', () => {
  it('CA-1 — les quatre tables, contraintes, index, politique et fonction de recherche existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('data_exports', 'idempotency_keys', 'legal_acceptances', 'rate_limits')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(TABLES);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée sur les quatre tables',
      ).toBe(true);

      const constraints = await tx.execute<Row>(sql`
        select conname as name
        from pg_constraint
        where conrelid in (
          'public.data_exports'::regclass,
          'public.idempotency_keys'::regclass,
          'public.legal_acceptances'::regclass,
          'public.rate_limits'::regclass
        )
      `);
      const names = constraints.map((row) => String(row.name));
      for (const expected of [
        'data_exports_storage_path_check',
        'data_exports_size_bytes_check',
        'data_exports_expires_at_check',
        'idempotency_keys_pkey',
        'idempotency_keys_key_check',
        'idempotency_keys_route_check',
        'idempotency_keys_request_hash_check',
        'idempotency_keys_status_code_check',
        'idempotency_keys_completed_at_check',
        'legal_acceptances_user_id_document_version_unique',
        'legal_acceptances_version_check',
        'rate_limits_bucket_check',
        'rate_limits_tokens_check',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('data_exports', 'idempotency_keys', 'legal_acceptances', 'rate_limits')
      `);
      const byName = new Map(indexes.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'data_exports_user_id_created_at_idx',
        'data_exports_expires_at_idx',
        'idempotency_keys_created_at_idx',
        'legal_acceptances_user_id_document_version_unique',
        'legal_acceptances_user_id_accepted_at_idx',
        'rate_limits_updated_at_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      expect(byName.get('data_exports_expires_at_idx') ?? '').toContain('WHERE');

      const searchIndexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('formations', 'notions', 'course_sections')
          and (indexdef like '%gin%' or indexdef like '%tsvector%')
      `);
      const searchByName = new Map(
        searchIndexes.map((row) => [String(row.name), String(row.definition)]),
      );
      for (const expected of [
        'formations_search_fts_idx',
        'formations_search_title_trgm_idx',
        'notions_fts_idx',
        'notions_search_label_trgm_idx',
        'notions_search_definition_trgm_idx',
        'course_sections_search_fts_idx',
        'course_sections_search_title_trgm_idx',
      ]) {
        expect(searchByName.has(expected), expected).toBe(true);
      }
      expect(searchByName.get('notions_fts_idx') ?? '').toContain('unaccent');
      expect(searchByName.get('notions_search_label_trgm_idx') ?? '').toContain('gin_trgm_ops');

      const fn = await tx.execute<Row>(sql`
        select p.prosecdef as security_definer, p.provolatile as volatility,
               pg_get_function_result(p.oid) as result
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'search_user_content'
      `);
      expect(fn).toHaveLength(1);
      // ET-2 — SECURITY INVOKER (prosecdef = false) and a stable read.
      expect(fn[0]?.security_definer).toBe(false);
      expect(String(fn[0]?.volatility)).toBe('s');
      expect(String(fn[0]?.result)).toContain('rank real');

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public'
          and cl.relname in (
            'data_exports', 'legal_acceptances', 'idempotency_keys', 'rate_limits',
            'formations', 'notions', 'courses', 'course_sections'
          )
        order by cl.relname, pol.polname
      `);
      const keys = policies.map((row) => `${String(row.table)}.${String(row.name)}`);
      for (const expected of [
        'data_exports.data_exports_owner_select',
        'legal_acceptances.legal_acceptances_owner_select',
        'legal_acceptances.legal_acceptances_owner_insert',
        'formations.formations_owner_select',
        'notions.notions_owner_all',
        'courses.courses_owner_all',
        'course_sections.course_sections_owner_all',
      ]) {
        expect(keys, expected).toContain(expected);
      }
      // ET-5 — no authenticated policy exposes idempotency keys or rate-limit buckets.
      expect(keys.filter((key) => key.startsWith('idempotency_keys.'))).toEqual([]);
      expect(keys.filter((key) => key.startsWith('rate_limits.'))).toEqual([]);
    });
  });

  it('CA-1 / CL-2 — l’expiration d’un export interdit le lien mais conserve la ligne', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const queued = await createDataExport(tx, {
        userId: user.id,
        createdAt: new Date('2026-11-01T08:00:00Z'),
      });
      expect(queued.status).toBe('queued');
      expect(canDownloadDataExport(queued, FIXED)).toBe(false);

      const done = await completeDataExport(tx, {
        userId: user.id,
        exportId: queued.id,
        storagePath: `exports/${user.id}/2026-11-01.zip`,
        sizeBytes: 2_400_000,
        expiresAt: new Date('2026-11-18T12:20:00Z'),
      });
      expect(done.status).toBe('done');
      expect(done.sizeBytes).toBe(2_400_000);
      expect(canDownloadDataExport(done, FIXED)).toBe(true);
      // EF-1, CL-2 — after expiration the row is kept for audit but no URL is issued.
      const after = new Date('2026-11-18T12:20:00.001Z');
      expect(canDownloadDataExport(done, after)).toBe(false);
      expect(await getDataExport(tx, { userId: user.id, exportId: queued.id })).toMatchObject({
        id: queued.id,
        status: 'done',
      });

      const failed = await createDataExport(tx, {
        userId: user.id,
        createdAt: new Date('2026-11-02T08:00:00Z'),
      });
      const failedRow = await failDataExport(tx, { userId: user.id, exportId: failed.id });
      expect(failedRow.status).toBe('failed');
      expect(failedRow.storagePath).toBeNull();
      expect(canDownloadDataExport(failedRow, FIXED)).toBe(false);

      const list = await listDataExports(tx, { userId: user.id });
      expect(list.map((row) => row.id)).toEqual([failed.id, queued.id]);

      // The SQL check refuses an expiration before creation.
      const invalid = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.data_exports (user_id, status, expires_at, created_at)
          values (
            ${user.id}::uuid, 'queued', '2026-11-01T00:00:00Z'::timestamptz,
            '2026-11-02T00:00:00Z'::timestamptz
          )
        `),
      );
      expect(invalid.code).toBe('23514');
      expect(invalid.message).toContain('data_exports_expires_at_check');
    });
  });

  it('CA-1 / CL-1 — une version acceptée deux fois ne double pas l’historique', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const first = await recordLegalAcceptance(tx, {
        userId: user.id,
        document: 'cgu',
        version: '1.2',
        acceptedAt: new Date('2026-11-01T09:00:00Z'),
      });
      expect(first.created).toBe(true);
      const replay = await recordLegalAcceptance(tx, {
        userId: user.id,
        document: 'cgu',
        version: '1.2',
        acceptedAt: new Date('2026-11-05T09:00:00Z'),
      });
      expect(replay.created).toBe(false);
      expect(replay.acceptance.id).toBe(first.acceptance.id);
      expect(replay.acceptance.acceptedAt.toISOString()).toBe('2026-11-01T09:00:00.000Z');

      const next = await recordLegalAcceptance(tx, {
        userId: user.id,
        document: 'cgu',
        version: '1.3',
        acceptedAt: new Date('2026-11-11T09:00:00Z'),
      });
      expect(next.created).toBe(true);
      const privacy = await recordLegalAcceptance(tx, {
        userId: user.id,
        document: 'privacy',
        version: '3.0',
        acceptedAt: new Date('2026-11-11T09:05:00Z'),
      });
      expect(privacy.created).toBe(true);

      const history = await listLegalAcceptances(tx, { userId: user.id });
      expect(history.map((row) => [row.document, row.version])).toEqual([
        ['privacy', '3.0'],
        ['cgu', '1.3'],
        ['cgu', '1.2'],
      ]);
      expect(await latestLegalAcceptance(tx, { userId: user.id, document: 'cgu' })).toMatchObject({
        version: '1.3',
      });
      expect(await count(tx, 'legal_acceptances', 'user_id', user.id)).toBe(3);

      // CL-1 — the history is append-only; a direct update is refused.
      const updated = await attempt(tx, () =>
        tx.execute(sql`
          update public.legal_acceptances set version = '9.9'
          where id = ${first.acceptance.id}::uuid
        `),
      );
      expect(updated.code).toBe('23514');
      expect(updated.message).toContain('legal_acceptance_immutable');
    });
  });

  it('CA-2 / CL-3 — rejeu identique, réutilisation incompatible et traitement en cours', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const key = 'export-replay-0001';
      const request = {
        userId: user.id,
        key,
        method: 'POST',
        route: '/api/v1/exports',
        params: { id: user.id },
        body: { format: 'zip' },
        now: FIXED,
      };

      const reserved = await reserveIdempotencyKey(tx, request);
      expect(reserved.state).toBe('reserved');
      expect(reserved.record.statusCode).toBe(0);
      expect(reserved.record.requestHash).toMatch(/^[0-9a-f]{64}$/);

      const responseBody = { exportId: '4f0d0f2a-0000-4000-8000-00000000ffff' };
      const completed = await completeIdempotencyKey(tx, {
        userId: user.id,
        key,
        statusCode: 202,
        response: responseBody,
        completedAt: new Date('2026-11-11T12:20:05Z'),
      });
      expect(completed.statusCode).toBe(202);
      expect(completed.completedAt?.toISOString()).toBe('2026-11-11T12:20:05.000Z');

      const replay = await reserveIdempotencyKey(tx, {
        ...request,
        now: new Date('2026-11-11T13:20:00Z'),
      });
      expect(replay.state).toBe('replayed');
      if (replay.state === 'replayed') {
        expect(replay.statusCode).toBe(202);
        expect(replay.response).toEqual(responseBody);
        expect(replay.record.completedAt?.toISOString()).toBe('2026-11-11T12:20:05.000Z');
      }

      // Another body or another route under the same key is a 422.
      const reusedBody = await rejected(
        reserveIdempotencyKey(tx, {
          ...request,
          body: { format: 'json' },
          now: new Date('2026-11-11T13:21:00Z'),
        }),
      );
      expect(reusedBody.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const reusedRoute = await rejected(
        reserveIdempotencyKey(tx, {
          ...request,
          route: '/api/v1/deletion',
          now: new Date('2026-11-11T13:21:00Z'),
        }),
      );
      expect(reusedRoute.code).toBe('IDEMPOTENCY_KEY_REUSED');

      // CL-3 — a reserved but unfinished request is a 409.
      const runningKey = 'export-running-0002';
      await reserveIdempotencyKey(tx, { ...request, key: runningKey });
      const running = await rejected(reserveIdempotencyKey(tx, { ...request, key: runningKey }));
      expect(running.code).toBe('IDEMPOTENCY_IN_PROGRESS');

      // A 5xx or exception releases the reservation.
      expect(await releaseIdempotencyKey(tx, { userId: user.id, key: runningKey })).toBe(true);
      expect(await getIdempotencyKey(tx, { userId: user.id, key: runningKey })).toBeNull();
      const reservedAgain = await reserveIdempotencyKey(tx, { ...request, key: runningKey });
      expect(reservedAgain.state).toBe('reserved');

      // ADR-0120 — a key older than 24 h is treated as absent and can be reserved again.
      const oldKey = 'export-old-0003';
      await reserveIdempotencyKey(tx, {
        ...request,
        key: oldKey,
        createdAt: new Date(FIXED.getTime() - 25 * HOUR),
      });
      await completeIdempotencyKey(tx, {
        userId: user.id,
        key: oldKey,
        statusCode: 200,
        response: { old: true },
        completedAt: new Date(FIXED.getTime() - 25 * HOUR + 1000),
      });
      const fresh = await reserveIdempotencyKey(tx, { ...request, key: oldKey, now: FIXED });
      expect(fresh.state).toBe('reserved');
      expect(fresh.record.statusCode).toBe(0);

      // The purge of SPEC-208 removes stale rows only.
      const recentKey = 'export-recent-0004';
      await reserveIdempotencyKey(tx, { ...request, key: recentKey });
      const purged = await deleteExpiredIdempotencyKeys(tx, {
        before: new Date(FIXED.getTime() - 24 * HOUR),
      });
      expect(purged).toBe(0);
      expect(await getIdempotencyKey(tx, { userId: user.id, key: recentKey })).not.toBeNull();
    });
  });

  it('CA-2 — les bornes d’idempotence sont aussi vérifiées par Postgres', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const hash = 'a'.repeat(64);

      const shortKey = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.idempotency_keys (user_id, key, route, request_hash)
          values (${user.id}::uuid, 'court', '/api/v1/exports', ${hash})
        `),
      );
      expect(shortKey.code).toBe('23514');
      expect(shortKey.message).toContain('idempotency_keys_key_check');

      const badHash = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.idempotency_keys (user_id, key, route, request_hash)
          values (${user.id}::uuid, 'export-badhash-01', '/api/v1/exports', 'pas-une-empreinte')
        `),
      );
      expect(badHash.code).toBe('23514');
      expect(badHash.message).toContain('idempotency_keys_request_hash_check');

      const badStatus = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.idempotency_keys (
            user_id, key, route, request_hash, status_code, completed_at
          )
          values (
            ${user.id}::uuid, 'export-badstatus-01', '/api/v1/exports', ${hash}, 999,
            '2026-11-11T12:20:00Z'::timestamptz
          )
        `),
      );
      expect(badStatus.code).toBe('23514');
      expect(badStatus.message).toContain('idempotency_keys_status_code_check');

      // A done status must carry its completion instant.
      const inconsistent = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.idempotency_keys (
            user_id, key, route, request_hash, status_code, completed_at
          )
          values (${user.id}::uuid, 'export-inconsistent-01', '/api/v1/exports', ${hash}, 200, null)
        `),
      );
      expect(inconsistent.code).toBe('23514');
      expect(inconsistent.message).toContain('idempotency_keys_completed_at_check');
    });
  });

  it('CA-2 / CL-4 — deux débits concurrents du même seau sont comptés sans perte', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      await upsertRateLimit(tx, {
        bucket: `user:${user.id}:/api/v1/search`,
        tokens: 10,
        now: FIXED,
      });
      return { userId: user.id, bucket: `user:${user.id}:/api/v1/search` };
    });

    try {
      const consume = () =>
        serviceDb().transaction((tx) =>
          consumeRateLimit(tx, { bucket: seed.bucket, capacity: 10, amount: 4, now: FIXED }),
        );
      const [first, second] = await Promise.all([consume(), consume()]);
      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect([first.remaining, second.remaining].sort((a, b) => a - b)).toEqual([2, 6]);

      const [row] = await serviceDb().execute<Row>(sql`
        select tokens::text as tokens from public.rate_limits where bucket = ${seed.bucket}
      `);
      expect(Number(row?.tokens)).toBe(2);

      // Exhaustion never goes below zero.
      const exhausted = await serviceDb().transaction((tx) =>
        consumeRateLimit(tx, { bucket: seed.bucket, capacity: 10, amount: 3, now: FIXED }),
      );
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(2);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CA-2 / CL-3 — deux requêtes concurrentes de la même clé ne créent qu’une ligne', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      return { userId: user.id };
    });

    try {
      const key = 'export-concurrent-01';
      const flow = () =>
        serviceDb().transaction(async (tx) => {
          const reservation = await reserveIdempotencyKey(tx, {
            userId: seed.userId,
            key,
            method: 'POST',
            route: '/api/v1/exports',
            body: { format: 'zip' },
            now: FIXED,
          });
          if (reservation.state === 'replayed') return 'replayed';
          await completeIdempotencyKey(tx, {
            userId: seed.userId,
            key,
            statusCode: 202,
            response: { exportId: seed.userId },
            completedAt: new Date(FIXED.getTime() + 5000),
          });
          return 'completed';
        });

      const settled = await Promise.all([flow(), flow()]);
      expect(settled.sort()).toEqual(['completed', 'replayed']);
      expect(await count(serviceDb(), 'idempotency_keys', 'user_id', seed.userId)).toBe(1);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CA-2 — le seau est atomique, remplaçable et purgé par date de mise à jour', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const bucket = `user:${user.id}:/api/v1/search`;

      const first = await consumeRateLimit(tx, { bucket, capacity: 3, amount: 1, now: FIXED });
      expect(first).toEqual({ allowed: true, remaining: 2 });
      const second = await consumeRateLimit(tx, { bucket, capacity: 3, amount: 1, now: FIXED });
      expect(second).toEqual({ allowed: true, remaining: 1 });
      const third = await consumeRateLimit(tx, { bucket, capacity: 3, amount: 1, now: FIXED });
      expect(third).toEqual({ allowed: true, remaining: 0 });
      const fourth = await consumeRateLimit(tx, { bucket, capacity: 3, amount: 1, now: FIXED });
      expect(fourth).toEqual({ allowed: false, remaining: 0 });

      const refilled = await upsertRateLimit(tx, { bucket, tokens: 5, now: FIXED });
      expect(refilled.tokens).toBe(5);
      const afterRefill = await consumeRateLimit(tx, {
        bucket,
        capacity: 5,
        amount: 2,
        now: FIXED,
      });
      expect(afterRefill).toEqual({ allowed: true, remaining: 3 });

      const staleBucket = `user:${user.id}:/api/v1/stale`;
      await upsertRateLimit(tx, {
        bucket: staleBucket,
        tokens: 1,
        now: new Date(FIXED.getTime() - 3 * HOUR),
      });
      expect(await deleteStaleRateLimits(tx, { before: new Date(FIXED.getTime() - HOUR) })).toBe(1);
      expect(await deleteStaleRateLimits(tx, { before: new Date(FIXED.getTime() - HOUR) })).toBe(0);
    });
  });

  it('CA-3 / CL-5 / CL-7 — accents, faute, cours ancien et section signalée', async () => {
    const { alice, bob } = await seedSearchFixtures();
    try {
      const aliceSearch = (q: string) =>
        userDb({ userId: alice.userId }).run((tx) => searchUserContent(tx, { q }));

      const accented = await aliceSearch('TRÉSORERIE');
      const kinds = new Set(accented.map((result) => result.kind));
      expect(kinds).toEqual(new Set(['formation', 'notion', 'section']));
      expect(accented.some((result) => result.id === alice.formationId)).toBe(true);
      expect(accented.some((result) => result.id === alice.notionId)).toBe(true);
      expect(accented.some((result) => result.id === alice.currentSectionId)).toBe(true);
      // CL-7 — old version and reported section are excluded.
      expect(accented.some((result) => result.id === alice.oldSectionId)).toBe(false);
      expect(accented.some((result) => result.id === alice.reportedSectionId)).toBe(false);
      // CA-4 — Bob's private words never appear.
      expect(accented.some((result) => result.id === bob.formationId)).toBe(false);
      expect(accented.some((result) => result.id === bob.currentSectionId)).toBe(false);

      const unaccented = await aliceSearch('tresorerie');
      expect(unaccented.map((result) => result.id)).toEqual(accented.map((result) => result.id));

      // CL-5 — one common typo still finds the learner's relevant rows.
      const typo = await aliceSearch('tresoriere');
      expect(typo.length).toBeGreaterThan(0);
      expect(
        typo.every((result) => result.kind !== 'section' || result.id !== alice.oldSectionId),
      ).toBe(true);
      expect(typo.some((result) => result.id === alice.notionId)).toBe(true);
      expect(typo.some((result) => result.id === bob.notionId)).toBe(false);

      // EF-6 — the returned snippet is plain text, bounded and free of markup.
      const section = accented.find((result) => result.kind === 'section');
      expect(section).toBeDefined();
      expect(section?.snippet).toContain('La trésorerie suit les encaissements.');
      expect(section?.snippet).not.toContain('<');
      expect(section?.snippet).not.toContain('>');
      expect(section?.snippet).not.toContain('script');
      expect((section?.snippet.length ?? 0) <= 160).toBe(true);
      expect(section?.href).toBe(
        `/formations/${alice.formationId}/modules/${alice.moduleId}/cours?chapitre=${alice.chapterId}`,
      );
      expect(accented.find((result) => result.kind === 'formation')?.href).toBe(
        `/formations/${alice.formationId}`,
      );
      expect(accented.find((result) => result.kind === 'notion')?.href).toBe(
        `/formations/${alice.formationId}/programme#notion-${alice.notionId}`,
      );

      // EF-5 / ET-2 — deterministic order: rank descending then stable identifier.
      for (let index = 1; index < accented.length; index += 1) {
        const previous = accented[index - 1];
        const current = accented[index];
        if (previous === undefined || current === undefined) continue;
        expect(previous.rank).toBeGreaterThanOrEqual(current.rank);
      }
      expect(accented.map((result) => result.id)).toEqual(unaccented.map((result) => result.id));

      // EF-5 / CL-5 — empty query returns nothing; grouping keeps the fixed order.
      expect(await aliceSearch('')).toEqual([]);
      expect(await aliceSearch('   ')).toEqual([]);
      const groups = groupSearchResults(accented);
      expect(groups.map((group) => group.kind)).toEqual(['formation', 'notion', 'section']);

      // CA-4 — Bob only sees his own rows for the same word.
      const bobResults = await userDb({ userId: bob.userId }).run((tx) =>
        searchUserContent(tx, { q: 'tresorerie' }),
      );
      expect(bobResults.length).toBeGreaterThan(0);
      expect(bobResults.some((result) => result.id === bob.formationId)).toBe(true);
      expect(bobResults.some((result) => result.id === alice.formationId)).toBe(false);
      expect(bobResults.some((result) => result.id === alice.currentSectionId)).toBe(false);
      expect(bobResults.some((result) => result.id === alice.notionId)).toBe(false);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${alice.userId}::uuid, ${bob.userId}::uuid)`,
      );
    }
  });

  it('CA-3 / CL-5 / CL-8 — requête vide, limite bornée et chaîne d’injection traitée comme donnée', async () => {
    const { alice, bob } = await seedSearchFixtures();
    try {
      const aliceSearch = (q: string, limit?: number) =>
        userDb({ userId: alice.userId }).run((tx) =>
          searchUserContent(tx, limit === undefined ? { q } : { q, limit }),
        );

      // ET-2 — the repository rejects an out-of-range limit.
      await expect(aliceSearch('tresorerie', 0)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(aliceSearch('tresorerie', 101)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      const limited = await aliceSearch('tresorerie', 1);
      expect(limited).toHaveLength(1);

      // The SQL function itself clamps a direct caller between 1 and 100.
      const direct = await userDb({ userId: alice.userId }).run(async (tx) => {
        const high = await tx.execute<Row>(sql`
          select count(*)::int as count from public.search_user_content('tresorerie', 500)
        `);
        const low = await tx.execute<Row>(sql`
          select count(*)::int as count from public.search_user_content('tresorerie', 0)
        `);
        return { high: Number(high[0]?.count ?? 0), low: Number(low[0]?.count ?? 0) };
      });
      expect(direct.high).toBeLessThanOrEqual(100);
      expect(direct.high).toBeGreaterThanOrEqual(3);
      expect(direct.low).toBe(1);

      // CL-8 — quotes, semicolons and SQL keywords are bound parameters, never SQL.
      const injection = await aliceSearch("'; drop table public.formations; --");
      expect(injection).toEqual([]);
      const tables = await serviceDb().execute<Row>(sql`
        select count(*)::int as count from information_schema.tables
        where table_schema = 'public' and table_name = 'formations'
      `);
      expect(Number(tables[0]?.count ?? 0)).toBe(1);

      const apostrophe = await aliceSearch("l'argent");
      expect(apostrophe).toEqual([]);
      const apostropheMatch = await userDb({ userId: alice.userId }).run((tx) =>
        searchUserContent(tx, { q: "l'argent" }),
      );
      expect(apostropheMatch).toEqual([]);
      // The learner's rows still exist after the injection attempt.
      const remaining = await serviceDb().execute<Row>(sql`
        select count(*)::int as count from public.notions
        where formation_id = ${alice.formationId}::uuid
      `);
      expect(Number(remaining[0]?.count ?? 0)).toBe(2);
      expect(bob.userId).not.toBe(alice.userId);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${alice.userId}::uuid, ${bob.userId}::uuid)`,
      );
    }
  });

  it('CA-3 / ET-3 — le plan d’une recherche substantielle utilise un index FTS', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 300,
      });

      await tx.execute(sql`set local enable_seqscan = off`);
      const rows = await tx.execute<Row>(sql`
        explain (format json, costs off)
        select n.id
        from public.notions n
        where to_tsvector(
          'simple',
          public.immutable_unaccent(n.label || ' ' || coalesce(n.short_definition, ''))
        ) @@ plainto_tsquery('simple', 'tresorerie')
      `);
      const plan = JSON.stringify(rows);
      // ET-3 — the plan is captured without any absolute machine time.
      expect(plan).toContain('Index');
      expect(plan).toContain('notions_fts_idx');

      const defs = await tx.execute<Row>(sql`
        select indexname as name from pg_indexes
        where schemaname = 'public' and indexname like '%search%trgm%'
        order by indexname
      `);
      expect(defs.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('CA-4 — deux JWT ne voient ni exports, ni acceptations, ni clés, ni seaux d’autrui', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const alice = await createTestUser(tx);
      const bob = await createTestUser(tx);
      const aliceExport = await createDataExport(tx, {
        userId: alice.id,
        status: 'done',
        storagePath: `exports/${alice.id}/a.zip`,
        expiresAt: new Date('2026-11-18T12:20:00Z'),
        sizeBytes: 10,
        createdAt: new Date('2026-11-11T08:00:00Z'),
      });
      const bobExport = await createDataExport(tx, {
        userId: bob.id,
        status: 'done',
        storagePath: `exports/${bob.id}/b.zip`,
        expiresAt: new Date('2026-11-18T12:20:00Z'),
        sizeBytes: 20,
        createdAt: new Date('2026-11-11T08:00:00Z'),
      });
      await recordLegalAcceptance(tx, {
        userId: alice.id,
        document: 'cgu',
        version: '1.2',
        acceptedAt: FIXED,
      });
      await recordLegalAcceptance(tx, {
        userId: bob.id,
        document: 'cgu',
        version: '1.2',
        acceptedAt: FIXED,
      });
      await reserveIdempotencyKey(tx, {
        userId: alice.id,
        key: 'alice-key-0001',
        method: 'POST',
        route: '/api/v1/exports',
        now: FIXED,
      });
      await reserveIdempotencyKey(tx, {
        userId: bob.id,
        key: 'bob-key-000001',
        method: 'POST',
        route: '/api/v1/exports',
        now: FIXED,
      });
      await upsertRateLimit(tx, {
        bucket: `user:${alice.id}:/api/v1/search`,
        tokens: 5,
        now: FIXED,
      });
      await upsertRateLimit(tx, { bucket: `user:${bob.id}:/api/v1/search`, tokens: 5, now: FIXED });
      return { alice, bob, aliceExport, bobExport };
    });

    try {
      const view = await userDb({ userId: seed.alice.id }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.data_exports) as exports,
            (select count(*)::int from public.data_exports where user_id = ${seed.bob.id}::uuid) as foreign_exports,
            (select count(*)::int from public.legal_acceptances) as acceptances,
            (select count(*)::int from public.legal_acceptances where user_id = ${seed.bob.id}::uuid) as foreign_acceptances,
            (select count(*)::int from public.idempotency_keys) as keys,
            (select count(*)::int from public.rate_limits) as buckets
        `);
        return rows[0];
      });
      expect(view).toMatchObject({
        exports: 1,
        foreign_exports: 0,
        acceptances: 1,
        foreign_acceptances: 0,
        keys: 0,
        buckets: 0,
      });

      // EF-1, EF-2 — another learner's rows are not readable through the repositories either.
      expect(
        await userDb({ userId: seed.alice.id }).run((tx) =>
          getDataExport(tx, { userId: seed.alice.id, exportId: seed.bobExport.id }),
        ),
      ).toBeNull();
      expect(
        await userDb({ userId: seed.alice.id }).run((tx) =>
          listDataExports(tx, { userId: seed.bob.id }),
        ),
      ).toEqual([]);
      expect(
        await userDb({ userId: seed.alice.id }).run((tx) =>
          listLegalAcceptances(tx, { userId: seed.bob.id }),
        ),
      ).toEqual([]);
      expect(
        await userDb({ userId: seed.alice.id }).run((tx) =>
          getIdempotencyKey(tx, { userId: seed.bob.id, key: 'bob-key-000001' }),
        ),
      ).toBeNull();

      // ET-5 — the user cannot create an export, read or write an idempotency key or a bucket.
      const foreignExport = await failureOfUserDb(
        (tx) =>
          createDataExport(tx, {
            userId: seed.alice.id,
            createdAt: FIXED,
          }),
        seed.alice.id,
      );
      expect(foreignExport.code).toBe('42501');
      const idempotencyWrite = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.idempotency_keys (user_id, key, route, request_hash)
            values (
              ${seed.alice.id}::uuid, 'alice-direct-01', '/api/v1/exports', ${'b'.repeat(64)}
            )
          `),
        seed.alice.id,
      );
      expect(idempotencyWrite.code).toBe('42501');
      const bucketWrite = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.rate_limits (bucket, tokens)
            values (${`user:${seed.alice.id}:/api/v1/other`}, 5)
          `),
        seed.alice.id,
      );
      expect(bucketWrite.code).toBe('42501');

      // EF-2 — Alice inserts her own acceptance but cannot write Bob's.
      const ownAcceptance = await userDb({ userId: seed.alice.id }).run((tx) =>
        recordLegalAcceptance(tx, {
          userId: seed.alice.id,
          document: 'privacy',
          version: '3.0',
          acceptedAt: FIXED,
        }),
      );
      expect(ownAcceptance.created).toBe(true);
      const foreignAcceptance = await failureOfUserDb(
        (tx) =>
          recordLegalAcceptance(tx, {
            userId: seed.bob.id,
            document: 'privacy',
            version: '3.0',
            acceptedAt: FIXED,
          }),
        seed.alice.id,
      );
      expect(foreignAcceptance.code).toBe('42501');

      // The owner still reads the export they created.
      const own = await userDb({ userId: seed.alice.id }).run((tx) =>
        getDataExport(tx, { userId: seed.alice.id, exportId: seed.aliceExport.id }),
      );
      expect(own?.id).toBe(seed.aliceExport.id);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${seed.alice.id}::uuid, ${seed.bob.id}::uuid)`,
      );
    }
  });

  it('CA-1 / CA-4 — la suppression du compte emporte exports, acceptations, clés et seaux', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      await createDataExport(tx, { userId: user.id, createdAt: FIXED });
      await recordLegalAcceptance(tx, {
        userId: user.id,
        document: 'cgu',
        version: '1.2',
        acceptedAt: FIXED,
      });
      await reserveIdempotencyKey(tx, {
        userId: user.id,
        key: 'delete-account-01',
        method: 'POST',
        route: '/api/v1/exports',
        now: FIXED,
      });
      await upsertRateLimit(tx, {
        bucket: `user:${user.id}:/api/v1/search`,
        tokens: 1,
        now: FIXED,
      });
      return user;
    });

    try {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.id}::uuid`);
      expect(await count(serviceDb(), 'data_exports', 'user_id', seed.id)).toBe(0);
      expect(await count(serviceDb(), 'legal_acceptances', 'user_id', seed.id)).toBe(0);
      expect(await count(serviceDb(), 'idempotency_keys', 'user_id', seed.id)).toBe(0);
      // The bucket key is not a user FK: SPEC-208 purges it by updated_at.
      expect(
        await serviceDb().transaction((tx) =>
          deleteStaleRateLimits(tx, { before: new Date('2030-01-01T00:00:00Z') }),
        ),
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.id}::uuid`);
    }
  });
});
