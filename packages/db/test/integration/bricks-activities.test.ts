// Integration tests of the brick/activity/attempt schema (SPEC-106 §12): introspection, SQL
// constraints, immutable versions, the ready-activity guard, attempt numbering under concurrency,
// frozen answer versions and RLS isolation with two real JWTs. Every test runs against the local
// Supabase database (testing.md §3). RLS isolation uses `userDb(ctx)` (ET-7), never the service
// role; the service role only seeds and cleans up.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  addBrickVersion,
  assertActivityItemsOwned,
  createActivity,
  createAttempt,
  getAttemptWithAnswers,
  recordAnswer,
  setActivityStatus,
} from '../../src/repositories/activities';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const ENUMS: Record<string, string[]> = {
  brick_type: [
    'text',
    'resource_excerpt',
    'choice_question',
    'open_question',
    'cloze',
    'matching',
    'ordering',
    'categorization',
    'recall_card',
    'instruction',
    'scripted_dialogue',
    'timer',
    'scoring',
  ],
  brick_purpose: [
    'course',
    'validation',
    'bank',
    'remediation',
    'exercise',
    'exam',
    'warmup',
    'review',
  ],
  brick_status: ['active', 'reported', 'retired'],
  activity_kind: [
    'course',
    'validation_quiz',
    'global_quiz_session',
    'remediation',
    'exercise',
    'mock_exam',
    'warmup',
    'micro_session',
    'sprint',
    'self_test',
    'scripted_dialogue',
    'project_step',
  ],
  activity_status: ['draft', 'ready', 'archived'],
  attempt_status: ['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned'],
  grader: ['code', 'tutor'],
  report_status: ['open', 'corrected', 'dismissed'],
};

const TABLES = ['activities', 'answers', 'attempts', 'brick_reports', 'brick_versions', 'bricks'];

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

/** SQLSTATE and messages of a Drizzle/driver error (Drizzle wraps driver errors in `cause`). */
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

/** Runs a statement that must fail, then restores the transaction to its savepoint. */
async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec106_${String(savepoint)}`;
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

/** Keeps `userDb` failures readable after its transaction has rolled back. */
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

/** Awaits a repository promise that must fail and asserts on the SQLSTATE/message chain. */

interface Base {
  userId: string;
  formationId: string;
  moduleId: string;
  chapterIds: string[];
  notionIds: string[];
}

async function createBase(tx: DbTx, options: { notions?: number } = {}): Promise<Base> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: options.notions ?? 2,
  });
  return {
    userId: user.id,
    formationId: programme.formationId,
    moduleId: programme.moduleIds[0] ?? '',
    chapterIds: programme.chapterIds,
    notionIds: programme.notionIds,
  };
}

interface BrickInput {
  ownerId: string;
  formationId: string;
  type?: string;
  purpose?: string;
  status?: string;
  notionIds?: string[];
}

async function insertBrick(tx: Queryable, input: BrickInput): Promise<string> {
  const notionIds = input.notionIds ?? [];
  const notionSql =
    notionIds.length === 0
      ? sql`'{}'::uuid[]`
      : sql`array[${sql.join(
          notionIds.map((notionId) => sql`${notionId}::uuid`),
          sql`, `,
        )}]::uuid[]`;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.type ?? 'choice_question'}::public.brick_type,
      ${notionSql},
      ${input.purpose ?? 'exercise'}::public.brick_purpose,
      ${input.status ?? 'active'}::public.brick_status
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('brique non créée');
  return id;
}

interface VersionInput {
  brickId: string;
  version?: number;
  payload?: Record<string, unknown>;
  fingerprint?: string | null;
  origin?: string;
  createdBy?: string;
}

async function insertVersion(tx: Queryable, input: VersionInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.brick_versions (
      brick_id, version, payload, fingerprint, origin, created_by
    )
    values (
      ${input.brickId}::uuid,
      ${input.version ?? 1},
      ${JSON.stringify(input.payload ?? { statement: 'Quelle est la clé du compte 401 ?' })}::jsonb,
      ${input.fingerprint ?? null},
      ${input.origin ?? 'tutor'}::public.content_origin,
      ${input.createdBy ?? 'tutor'}::public.actor
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('version non créée');
  return id;
}

interface ActivityInput {
  ownerId: string;
  formationId: string;
  moduleId?: string | null;
  kind?: string;
  status?: string;
  items?: { brickId: string; brickVersionId: string; points?: number }[];
  config?: Record<string, unknown>;
  forDate?: string | null;
}

async function insertActivity(tx: Queryable, input: ActivityInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status, for_date
    )
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.moduleId ?? null}::uuid,
      ${input.kind ?? 'exercise'}::public.activity_kind,
      ${JSON.stringify(input.config ?? {})}::jsonb,
      ${JSON.stringify(input.items ?? [])}::jsonb,
      ${input.status ?? 'draft'}::public.activity_status,
      ${input.forDate ?? null}::date
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('activité non créée');
  return id;
}

async function insertAttempt(
  tx: Queryable,
  input: {
    userId: string;
    activityId: string;
    attemptNo?: number;
    status?: string;
    score?: number | null;
    durationMs?: number | null;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, score, duration_ms
    )
    values (
      ${input.userId}::uuid,
      ${input.activityId}::uuid,
      ${input.attemptNo ?? 1},
      ${input.status ?? 'in_progress'}::public.attempt_status,
      ${input.score ?? null},
      ${input.durationMs ?? null}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('tentative non créée');
  return id;
}

async function insertAnswer(
  tx: Queryable,
  input: {
    attemptId: string;
    brickVersionId: string;
    position?: number;
    response?: unknown;
    score?: number | null;
    maxScore?: number | null;
    timeMs?: number | null;
    gradedBy?: string | null;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.answers (
      attempt_id, brick_version_id, position, response, score, max_score, time_ms, graded_by
    )
    values (
      ${input.attemptId}::uuid,
      ${input.brickVersionId}::uuid,
      ${input.position ?? 1},
      ${JSON.stringify(input.response ?? { choice: 'a' })}::jsonb,
      ${input.score ?? null},
      ${input.maxScore ?? null},
      ${input.timeMs ?? null},
      ${input.gradedBy ?? null}::public.grader
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('réponse non créée');
  return id;
}

async function count(tx: Queryable, table: string, where: string, value: string): Promise<number> {
  const rows = await tx.execute<Row>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(where)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? -1);
}

/** One learner with one brick, one version, one ready activity, one attempt and one answer. */
interface Seed {
  userId: string;
  formationId: string;
  brickId: string;
  versionId: string;
  activityId: string;
  attemptId: string;
  answerId: string;
  reportId: string;
}

async function seedLearner(tx: Queryable): Promise<Seed> {
  const user = await createTestUser(tx as DbTx);
  const programme = await createTestProgramme(tx as DbTx, user.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
  });
  const brickId = await insertBrick(tx, {
    ownerId: user.id,
    formationId: programme.formationId,
  });
  const versionId = await insertVersion(tx, { brickId });
  const activityId = await insertActivity(tx, {
    ownerId: user.id,
    formationId: programme.formationId,
    moduleId: programme.moduleIds[0] ?? null,
    status: 'ready',
    items: [{ brickId, brickVersionId: versionId }],
  });
  const attemptId = await insertAttempt(tx, { userId: user.id, activityId });
  const answerId = await insertAnswer(tx, { attemptId, brickVersionId: versionId });
  const reportRows = await tx.execute<{ id: string }>(sql`
    insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
    values (${user.id}::uuid, ${brickId}::uuid, ${versionId}::uuid, 'Énoncé ambigu')
    returning id::text as id
  `);
  const reportId = reportRows[0]?.id ?? '';
  return {
    userId: user.id,
    formationId: programme.formationId,
    brickId,
    versionId,
    activityId,
    attemptId,
    answerId,
    reportId,
  };
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-106] brick persistence', () => {
  it('CA-1 — les six tables, huit énumérations, contraintes, index, déclencheurs et politiques existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('bricks', 'brick_versions', 'brick_reports', 'activities', 'attempts', 'answers')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(TABLES);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée sur les six tables (ET-6, ADR-0112)',
      ).toBe(true);

      for (const [name, values] of Object.entries(ENUMS)) {
        const rows = await tx.execute<Row>(sql`
          select e.enumlabel as label
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typnamespace = 'public'::regnamespace and t.typname = ${name}
          order by e.enumsortorder
        `);
        expect(
          rows.map((row) => String(row.label)),
          name,
        ).toEqual(values);
      }

      const constraints = await tx.execute<Row>(sql`
        select conname as name
        from pg_constraint
        where conrelid in (
          'public.bricks'::regclass,
          'public.brick_versions'::regclass,
          'public.brick_reports'::regclass,
          'public.activities'::regclass,
          'public.attempts'::regclass,
          'public.answers'::regclass
        )
      `);
      const names = constraints.map((row) => String(row.name));
      for (const expected of [
        'bricks_current_version_check',
        'brick_versions_brick_id_version_unique',
        'brick_versions_version_check',
        'brick_versions_payload_check',
        'brick_versions_fingerprint_check',
        'brick_reports_version_brick_fk',
        'brick_reports_reason_length_check',
        'brick_reports_resolved_at_check',
        'activities_ready_items_check',
        'attempts_activity_id_user_id_attempt_no_unique',
        'attempts_attempt_no_check',
        'attempts_duration_ms_check',
        'attempts_score_check',
        'answers_attempt_id_position_unique',
        'answers_score_check',
        'answers_max_score_check',
        'answers_score_max_score_check',
        'answers_time_ms_check',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public' and tablename in (
          'bricks', 'brick_versions', 'brick_reports', 'activities', 'attempts', 'answers'
        )
      `);
      const byName = new Map(indexes.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'bricks_owner_id_idx',
        'bricks_formation_id_idx',
        'bricks_owner_status_idx',
        'bricks_notion_ids_idx',
        'brick_versions_fingerprint_idx',
        'brick_reports_user_id_idx',
        'activities_owner_id_idx',
        'activities_owner_status_idx',
        'activities_for_date_idx',
        'attempts_user_id_idx',
        'attempts_activity_id_idx',
        'answers_attempt_id_idx',
        'answers_brick_version_id_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      expect(byName.get('bricks_notion_ids_idx') ?? '').toContain('USING gin');
      expect(byName.get('brick_versions_fingerprint_idx') ?? '').toContain('WHERE');

      const triggers = await tx.execute<Row>(sql`
        select cl.relname as table, tg.tgname as name
        from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
      `);
      const triggerKeys = new Set(
        triggers.map((row) => `${String(row.table)}.${String(row.name)}`),
      );
      for (const expected of [
        'brick_versions.brick_versions_immutable',
        'brick_reports.brick_reports_owner_consistency',
        'attempts.attempts_owner_consistency',
        'activities.activities_ready_items',
      ]) {
        expect(triggerKeys.has(expected), expected).toBe(true);
      }

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public'
          and cl.relname in ('bricks', 'brick_versions', 'brick_reports', 'activities', 'attempts', 'answers')
        order by cl.relname
      `);
      expect(policies.map((row) => String(row.table))).toEqual(TABLES);
      expect(policies.map((row) => String(row.name))).toEqual([
        'activities_owner_all',
        'answers_owner_all',
        'attempts_owner_all',
        'brick_reports_owner_all',
        'brick_versions_owner_all',
        'bricks_owner_all',
      ]);

      // ET-2 — score and max_score are numeric(5,2); durations are integers.
      const numeric = await tx.execute<Row>(sql`
        select table_name, column_name, numeric_precision, numeric_scale
        from information_schema.columns
        where table_schema = 'public'
          and ((table_name = 'attempts' and column_name = 'score')
            or (table_name = 'answers' and column_name in ('score', 'max_score')))
        order by table_name, column_name
      `);
      expect(numeric).toEqual([
        { table_name: 'answers', column_name: 'max_score', numeric_precision: 5, numeric_scale: 2 },
        { table_name: 'answers', column_name: 'score', numeric_precision: 5, numeric_scale: 2 },
        { table_name: 'attempts', column_name: 'score', numeric_precision: 5, numeric_scale: 2 },
      ]);
    });
  });

  it('CA-1 / CL-1 / CL-2 — versions immuables, numéro 0 et doublons refusés, empreinte indexée', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        notionIds: base.notionIds.slice(0, 1),
      });
      const versionId = await insertVersion(tx, {
        brickId,
        version: 1,
        fingerprint: 'a'.repeat(64),
      });

      // CL-1 — version 0 refused by the SQL constraint.
      const zero = await attempt(tx, () => insertVersion(tx, { brickId, version: 0 }));
      expect(zero.code).toBe('23514');
      expect(zero.message).toContain('brick_versions_version_check');

      // CL-1 — duplicate version refused; the existing row is untouched.
      const duplicate = await attempt(tx, () => insertVersion(tx, { brickId, version: 1 }));
      expect(duplicate.code).toBe('23505');
      expect(duplicate.message).toContain('brick_versions_brick_id_version_unique');

      // EF-2 — a version is never rewritten.
      const rewritten = await attempt(tx, () =>
        tx.execute(sql`
          update public.brick_versions
          set payload = '{"statement":"réécrit"}'::jsonb
          where id = ${versionId}::uuid
        `),
      );
      expect(rewritten.code).toBe('23514');
      expect(rewritten.message).toContain('brick_version_immutable');
      const kept = await tx.execute<Row>(sql`
        select payload from public.brick_versions where id = ${versionId}::uuid
      `);
      expect(kept[0]?.payload).toEqual({ statement: 'Quelle est la clé du compte 401 ?' });

      // CL-2 — a repeated fingerprint is insertable (the index exposes the duplicate to SPEC-513).
      const repeated = await attempt(tx, () =>
        insertVersion(tx, { brickId, version: 2, fingerprint: 'a'.repeat(64) }),
      );
      expect(repeated.code).toBe('00000');

      // An invalid fingerprint is refused.
      const invalidFingerprint = await attempt(tx, () =>
        insertVersion(tx, { brickId, version: 3, fingerprint: 'xyz' }),
      );
      expect(invalidFingerprint.code).toBe('23514');
      expect(invalidFingerprint.message).toContain('brick_versions_fingerprint_check');

      // EF-2 — a report targets the version of its own brick (composite foreign key).
      const otherBrick = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
      });
      const otherVersion = await insertVersion(tx, { brickId: otherBrick });
      const wrongVersion = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
          values (
            ${base.userId}::uuid, ${brickId}::uuid, ${otherVersion}::uuid, 'Version étrangère'
          )
        `),
      );
      expect(wrongVersion.code).toBe('23503');
      expect(wrongVersion.message).toContain('brick_reports_version_brick_fk');

      // EF-2 — reason ≤ 500 characters and a closed report carries its resolution instant.
      const longReason = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
          values (
            ${base.userId}::uuid, ${brickId}::uuid, ${versionId}::uuid, ${'a'.repeat(501)}
          )
        `),
      );
      expect(longReason.code).toBe('23514');
      expect(longReason.message).toContain('brick_reports_reason_length_check');

      const closedWithoutDate = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.brick_reports (user_id, brick_id, brick_version_id, reason, status)
          values (
            ${base.userId}::uuid, ${brickId}::uuid, ${versionId}::uuid, 'Corrigé', 'corrected'
          )
        `),
      );
      expect(closedWithoutDate.code).toBe('23514');
      expect(closedWithoutDate.message).toContain('brick_reports_resolved_at_check');
    });
  });

  it('CA-1 / EF-3 / EF-5 — contraintes de positions et de bornes des tentatives et réponses', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
      });
      const versionId = await insertVersion(tx, { brickId });
      const activityId = await insertActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        status: 'ready',
        items: [{ brickId, brickVersionId: versionId }],
      });
      const attemptId = await insertAttempt(tx, { userId: base.userId, activityId });

      const duplicateAttempt = await attempt(tx, () =>
        insertAttempt(tx, { userId: base.userId, activityId, attemptNo: 1 }),
      );
      expect(duplicateAttempt.code).toBe('23505');
      expect(duplicateAttempt.message).toContain('attempts_activity_id_user_id_attempt_no_unique');

      const zeroAttempt = await attempt(tx, () =>
        insertAttempt(tx, { userId: base.userId, activityId, attemptNo: 0 }),
      );
      expect(zeroAttempt.code).toBe('23514');
      expect(zeroAttempt.message).toContain('attempts_attempt_no_check');

      // CL-6 — out-of-range attempt score and negative duration.
      const tooHigh = await attempt(tx, () =>
        insertAttempt(tx, {
          userId: base.userId,
          activityId,
          attemptNo: 2,
          score: 101,
        }),
      );
      expect(tooHigh.code).toBe('23514');
      expect(tooHigh.message).toContain('attempts_score_check');

      const negativeDuration = await attempt(tx, () =>
        insertAttempt(tx, {
          userId: base.userId,
          activityId,
          attemptNo: 2,
          durationMs: -1,
        }),
      );
      expect(negativeDuration.code).toBe('23514');
      expect(negativeDuration.message).toContain('attempts_duration_ms_check');

      await insertAnswer(tx, { attemptId, brickVersionId: versionId, position: 1 });

      const duplicatePosition = await attempt(tx, () =>
        insertAnswer(tx, { attemptId, brickVersionId: versionId, position: 1 }),
      );
      expect(duplicatePosition.code).toBe('23505');
      expect(duplicatePosition.message).toContain('answers_attempt_id_position_unique');

      const zeroPosition = await attempt(tx, () =>
        insertAnswer(tx, { attemptId, brickVersionId: versionId, position: 0 }),
      );
      expect(zeroPosition.code).toBe('23514');
      expect(zeroPosition.message).toContain('answers_position_check');

      const tooHighAnswer = await attempt(tx, () =>
        insertAnswer(tx, {
          attemptId,
          brickVersionId: versionId,
          position: 2,
          score: 101,
          maxScore: 100,
        }),
      );
      expect(tooHighAnswer.code).toBe('23514');
      expect(tooHighAnswer.message).toContain('answers_score_check');

      const scoreAboveMax = await attempt(tx, () =>
        insertAnswer(tx, {
          attemptId,
          brickVersionId: versionId,
          position: 2,
          score: 2,
          maxScore: 1,
        }),
      );
      expect(scoreAboveMax.code).toBe('23514');
      expect(scoreAboveMax.message).toContain('answers_score_max_score_check');

      const negativeAnswerTime = await attempt(tx, () =>
        insertAnswer(tx, {
          attemptId,
          brickVersionId: versionId,
          position: 2,
          timeMs: -1,
        }),
      );
      expect(negativeTime(negativeAnswerTime)).toBe(true);

      // ET-4 — the repository validates score/max_score before writing.
      await expect(
        recordAnswer(tx, {
          attemptId,
          brickVersionId: versionId,
          position: 2,
          score: 5,
          maxScore: 4,
        }),
      ).rejects.toThrow(/maxScore/);
    });
  });

  it('CA-2 / CL-3 — une activité prête refuse une brique signalée, étrangère, absente ou d’une autre formation', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const other = await createTestUser(tx);
      const otherProgramme = await createTestProgramme(tx, other.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
      });
      const versionId = await insertVersion(tx, { brickId });
      const foreignBrick = await insertBrick(tx, {
        ownerId: other.id,
        formationId: base.formationId,
      });
      const foreignVersion = await insertVersion(tx, { brickId: foreignBrick });
      const foreignFormationBrick = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: otherProgramme.formationId,
      });
      const foreignFormationVersion = await insertVersion(tx, {
        brickId: foreignFormationBrick,
      });

      const items = [{ brickId, brickVersionId: versionId }];

      // Valid assembly goes through the repository.
      const draft = await createActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        kind: 'exercise',
        items,
        status: 'ready',
      });
      expect(draft.status).toBe('ready');

      // A reported brick can no longer be selected for a new activity (EF-1).
      await tx.execute(sql`
        update public.bricks set status = 'reported' where id = ${brickId}::uuid
      `);
      const reported = await attempt(tx, () =>
        createActivity(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          kind: 'exercise',
          items,
          status: 'ready',
        }),
      );
      expect(reported.code).toBe('23514');
      expect(reported.message).toContain('activity_item_status');
      expect(await count(tx, 'activities', 'owner_id', base.userId)).toBe(1);

      // A brick of another learner is refused without a partial write.
      await tx.execute(sql`
        update public.bricks set status = 'active' where id = ${brickId}::uuid
      `);
      const foreignOwner = await attempt(tx, () =>
        assertActivityItemsOwned(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          items: [{ brickId: foreignBrick, brickVersionId: foreignVersion }],
        }),
      );
      expect(foreignOwner.code).toBe('23514');
      expect(foreignOwner.message).toContain('activity_item_owner_mismatch');

      // A version that belongs to another brick is refused.
      const versionMismatch = await attempt(tx, () =>
        assertActivityItemsOwned(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          items: [{ brickId, brickVersionId: foreignVersion }],
        }),
      );
      expect(versionMismatch.code).toBe('23514');
      expect(versionMismatch.message).toContain('activity_item_version_mismatch');

      // A missing version is refused.
      const missingVersion = await attempt(tx, () =>
        assertActivityItemsOwned(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          items: [{ brickId, brickVersionId: '6f1d0f2a-0000-4000-8000-00000000ffff' }],
        }),
      );
      expect(missingVersion.code).toBe('23514');
      expect(missingVersion.message).toContain('activity_item_version_missing');

      // A brick of another formation is refused.
      const formationMismatch = await attempt(tx, () =>
        assertActivityItemsOwned(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          items: [{ brickId: foreignFormationBrick, brickVersionId: foreignFormationVersion }],
        }),
      );
      expect(formationMismatch.code).toBe('23514');
      expect(formationMismatch.message).toContain('activity_item_formation_mismatch');

      // The SQL trigger also protects a direct writer.
      const directReady = await attempt(tx, () =>
        insertActivity(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          status: 'ready',
          items: [{ brickId: foreignBrick, brickVersionId: foreignVersion }],
        }),
      );
      expect(directReady.code).toBe('23514');
      expect(directReady.message).toContain('activity_item_owner_mismatch');

      const emptyReady = await attempt(tx, () =>
        insertActivity(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          status: 'ready',
          items: [],
        }),
      );
      expect(emptyReady.code).toBe('23514');
      expect(
        emptyReady.message.includes('activities_ready_items_check') ||
          emptyReady.message.includes('activity_items_empty'),
      ).toBe(true);

      // Transition: a draft becomes invalid when its brick is reported meanwhile.
      const transition = await insertActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        status: 'draft',
        items,
      });
      await tx.execute(sql`
        update public.bricks set status = 'retired' where id = ${brickId}::uuid
      `);
      const retired = await attempt(tx, () =>
        setActivityStatus(tx, {
          activityId: transition,
          ownerId: base.userId,
          status: 'ready',
        }),
      );
      expect(retired.code).toBe('23514');
      expect(retired.message).toContain('activity_item_status');
      const stillDraft = await tx.execute<Row>(sql`
        select status from public.activities where id = ${transition}::uuid
      `);
      expect(stillDraft[0]?.status).toBe('draft');
    });
  });

  it('CA-3 / CL-5 / EF-6 — une réponse garde sa version après publication d’une nouvelle version', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx, { notions: 1 });
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        notionIds: base.notionIds.slice(0, 1),
      });
      const firstVersion = await addBrickVersion(tx, {
        brickId,
        version: 1,
        payload: { statement: 'Quelle est la clé du compte 401 ?' },
        origin: 'tutor',
        createdBy: 'tutor',
      });

      const activity = await createActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        kind: 'validation_quiz',
        config: { threshold: 80, questionCount: 1 },
        items: [{ brickId, brickVersionId: firstVersion.id, points: 1 }],
        status: 'ready',
      });
      const attempt = await createAttempt(tx, {
        userId: base.userId,
        activityId: activity.id,
      });
      const answer = await recordAnswer(tx, {
        attemptId: attempt.id,
        brickVersionId: firstVersion.id,
        position: 1,
        response: { choice: '401' },
        isCorrect: true,
        score: 1,
        maxScore: 1,
        timeMs: 4200,
        gradedBy: 'code',
        feedback: { explanation: 'Compte fournisseur.', criteria: [] },
      });
      expect(answer.brickVersionId).toBe(firstVersion.id);

      // Publish version 2: the current version moves, the answer does not.
      const secondVersion = await addBrickVersion(tx, {
        brickId,
        version: 2,
        payload: { statement: 'Quelle est la contrepartie du compte 401 ?' },
        origin: 'tutor',
        createdBy: 'tutor',
      });
      expect(secondVersion.version).toBe(2);

      const detail = await getAttemptWithAnswers(tx, {
        attemptId: attempt.id,
        userId: base.userId,
      });
      expect(detail.answers).toHaveLength(1);
      expect(detail.answers[0]).toMatchObject({
        position: 1,
        brickId,
        brickVersionId: firstVersion.id,
        brickVersion: 1,
        brickType: 'choice_question',
        isCorrect: true,
        score: 1,
      });
      expect(detail.activity.items).toEqual([
        { brickId, brickVersionId: firstVersion.id, points: 1 },
      ]);

      // EF-6 — the transaction reloads exactly what it wrote.
      const reloaded = await tx.execute<Row>(sql`
        select
          (select current_version from public.bricks where id = ${brickId}::uuid) as current_version,
          (select brick_version_id::text from public.answers where id = ${answer.id}::uuid) as answer_version
      `);
      expect(reloaded[0]).toMatchObject({
        current_version: 2,
        answer_version: firstVersion.id,
      });
    });
  });

  it('CA-3 — une tentative exige une activité prête et un numéro unique', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
      });
      const versionId = await insertVersion(tx, { brickId });
      const draft = await createActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        kind: 'exercise',
        items: [{ brickId, brickVersionId: versionId }],
        status: 'draft',
      });
      await expect(
        createAttempt(tx, { userId: base.userId, activityId: draft.id }),
      ).rejects.toThrow(/activité prête/);

      await setActivityStatus(tx, {
        activityId: draft.id,
        ownerId: base.userId,
        status: 'ready',
      });
      const first = await createAttempt(tx, { userId: base.userId, activityId: draft.id });
      const second = await createAttempt(tx, { userId: base.userId, activityId: draft.id });
      expect([first.attemptNo, second.attemptNo]).toEqual([1, 2]);
    });
  });

  it('CA-4 / CL-8 — deux JWT distincts ne lisent ni n’écrivent les lignes de l’autre (userDb)', async () => {
    // Real transactions: seed with the service role, then read/write with two authenticated JWTs.
    const alice = await serviceDb().transaction((tx) => seedLearner(tx));
    const bob = await serviceDb().transaction((tx) => seedLearner(tx));
    try {
      const aliceView = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.bricks) as bricks,
            (select count(*)::int from public.brick_versions) as versions,
            (select count(*)::int from public.brick_reports) as reports,
            (select count(*)::int from public.activities) as activities,
            (select count(*)::int from public.attempts) as attempts,
            (select count(*)::int from public.answers) as answers,
            (select count(*)::int from public.bricks where id = ${bob.brickId}::uuid) as foreign_bricks,
            (select count(*)::int from public.answers where id = ${bob.answerId}::uuid) as foreign_answers
        `);
        return rows[0];
      });
      expect(aliceView).toMatchObject({
        bricks: 1,
        versions: 1,
        reports: 1,
        activities: 1,
        attempts: 1,
        answers: 1,
        foreign_bricks: 0,
        foreign_answers: 0,
      });

      // Reading another learner's rows by identifier yields nothing.
      const foreignRead = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select id::text as id from public.activities where id = ${bob.activityId}::uuid
        `);
        return rows;
      });
      expect(foreignRead).toEqual([]);

      // Inserting a brick owned by Bob under Alice's JWT is refused by RLS.
      const forbiddenInsert = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.bricks (owner_id, formation_id, type, purpose)
            values (
              ${bob.userId}::uuid, ${bob.formationId}::uuid, 'text', 'exercise'
            )
          `),
        alice.userId,
      );
      expect(forbiddenInsert.code).toBe('42501');

      // Updating and deleting another learner's rows affects nothing.
      const foreignUpdate = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          update public.bricks set status = 'reported'
          where id = ${bob.brickId}::uuid
          returning id::text as id
        `);
        return rows;
      });
      expect(foreignUpdate).toEqual([]);
      const foreignDelete = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          delete from public.answers where id = ${bob.answerId}::uuid
          returning id::text as id
        `);
        return rows;
      });
      expect(foreignDelete).toEqual([]);

      // An answer can only be attached to one's own attempt.
      const foreignAnswer = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.answers (attempt_id, brick_version_id, position)
            values (${bob.attemptId}::uuid, ${bob.versionId}::uuid, 2)
          `),
        alice.userId,
      );
      expect(foreignAnswer.code).toBe('42501');

      // Alice still reads her own answer after the attempts above.
      const ownAnswer = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select id::text as id from public.answers where id = ${alice.answerId}::uuid
        `);
        return rows;
      });
      expect(ownAnswer).toHaveLength(1);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${alice.userId}::uuid, ${bob.userId}::uuid)`,
      );
    }
  });

  it('CL-4 — deux créations concurrentes de tentative obtiennent les numéros 1 et 2', async () => {
    // Deliberately outside withRollback: the two transactions must really commit and race.
    const seed = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const brickId = await insertBrick(tx, {
        ownerId: user.id,
        formationId: programme.formationId,
      });
      const versionId = await insertVersion(tx, { brickId });
      const activityId = await insertActivity(tx, {
        ownerId: user.id,
        formationId: programme.formationId,
        status: 'ready',
        items: [{ brickId, brickVersionId: versionId }],
      });
      return { userId: user.id, activityId };
    });

    try {
      const create = () =>
        serviceDb().transaction((tx) =>
          createAttempt(tx, { userId: seed.userId, activityId: seed.activityId }),
        );
      const [first, second] = await Promise.all([create(), create()]);
      expect([first.attemptNo, second.attemptNo].sort((a, b) => a - b)).toEqual([1, 2]);

      const rows = await serviceDb().execute<Row>(sql`
        select attempt_no from public.attempts
        where activity_id = ${seed.activityId}::uuid and user_id = ${seed.userId}::uuid
        order by attempt_no
      `);
      expect(rows.map((row) => Number(row.attempt_no))).toEqual([1, 2]);
      // The unique constraint remains the backstop (also covered by CA-1 under withRollback).
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CL-7 — supprimer une activité efface ses tentatives et réponses sans orphelin', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const brickId = await insertBrick(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
      });
      const versionId = await insertVersion(tx, { brickId });
      const activityId = await insertActivity(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        status: 'ready',
        items: [{ brickId, brickVersionId: versionId }],
      });
      const attemptId = await insertAttempt(tx, {
        userId: base.userId,
        activityId,
      });
      await insertAnswer(tx, {
        attemptId,
        brickVersionId: versionId,
        position: 1,
      });
      await insertAnswer(tx, {
        attemptId,
        brickVersionId: versionId,
        position: 2,
      });

      await tx.execute(sql`delete from public.activities where id = ${activityId}::uuid`);
      expect(await count(tx, 'attempts', 'activity_id', activityId)).toBe(0);
      const orphans = await tx.execute<Row>(sql`
        select count(*)::int as count from public.answers
        where attempt_id = ${attemptId}::uuid
      `);
      expect(orphans[0]?.count).toBe(0);

      // Deleting the learner cascades through every personal table of the domain.
      await tx.execute(sql`delete from auth.users where id = ${base.userId}::uuid`);
      expect(await count(tx, 'bricks', 'id', brickId)).toBe(0);
      expect(await count(tx, 'brick_versions', 'id', versionId)).toBe(0);
    });
  });
});

function negativeTime(failure: Failure): boolean {
  return failure.code === '23514' && failure.message.includes('answers_time_ms_check');
}
