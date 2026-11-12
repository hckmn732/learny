// Integration tests of the memory/gap schema (SPEC-107 §12): introspection, SQL constraints,
// FSRS persistence, due-question filtering and plan, atomic review/gap writes, concurrent answers,
// append-only history, answer retention and RLS isolation with two real JWTs. Every test runs
// against the local Supabase database (testing.md §3); isolation uses `userDb(ctx)` (ET-4), never
// the service role. The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047).
import { sql } from 'drizzle-orm';
import { createEmptyCard } from 'ts-fsrs';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  applyReview,
  clearGap,
  countDueNotionStates,
  createNotionState,
  detectGap,
  getDueNotionStates,
  getGapEvents,
  getReviewHistory,
} from '../../src/repositories/notion-states';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const FIXED = new Date('2026-11-11T12:20:00Z');
const LATER = new Date('2026-11-18T08:00:00Z');
const LATER_STILL = new Date('2026-11-25T08:00:00Z');

const TABLES = ['gap_events', 'notion_states', 'review_logs'];

const ENUMS: Record<string, string[]> = {
  fsrs_grade: ['again', 'hard', 'good', 'easy'],
  gap_event_kind: ['detected', 'nature_changed', 'cleared'],
  gap_nature: ['forgetting', 'confusion', 'misunderstanding', 'application'],
  review_source: [
    'validation',
    'global_quiz',
    'warmup',
    'exercise',
    'exam',
    'self_test',
    'micro_session',
    'sprint',
    'offline',
  ],
};

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
  const name = `spec107_${String(savepoint)}`;
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

interface CardOverrides {
  due?: string;
  stability?: number;
  difficulty?: number;
  elapsed_days?: number;
  scheduled_days?: number;
  reps?: number;
  lapses?: number;
  state?: 0 | 1 | 2 | 3;
  last_review?: string | null;
}

function card(overrides: CardOverrides = {}) {
  const empty = createEmptyCard(FIXED);
  return {
    due: empty.due.toISOString(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ET-2 names elapsed_days (ADR-0242).
    elapsed_days: empty.elapsed_days,
    scheduled_days: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state as 0 | 1 | 2 | 3,
    last_review: null,
    ...overrides,
  };
}

interface Base {
  userId: string;
  formationId: string;
  notionIds: string[];
}

async function createBase(
  tx: DbTx,
  options: { notions?: number; chaptersPerModule?: number } = {},
): Promise<Base> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: options.chaptersPerModule ?? 1,
    notionsPerChapter: options.notions ?? 4,
  });
  return { userId: user.id, formationId: programme.formationId, notionIds: programme.notionIds };
}

async function count(tx: Queryable, table: string, where: string, value: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(where)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

async function insertLog(
  tx: Queryable,
  input: {
    userId: string;
    notionId: string;
    source?: string;
    grade?: string;
    reviewedAt?: Date;
    answerId?: string | null;
    timeMs?: number;
    fsrsBefore?: unknown;
    fsrsAfter?: unknown;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.review_logs (
      user_id, notion_id, answer_id, source, grade, correct, time_ms, reviewed_at,
      fsrs_before, fsrs_after
    )
    values (
      ${input.userId}::uuid,
      ${input.notionId}::uuid,
      ${input.answerId ?? null}::uuid,
      ${input.source ?? 'global_quiz'}::public.review_source,
      ${input.grade ?? 'good'}::public.fsrs_grade,
      true,
      ${input.timeMs ?? 4200},
      ${(input.reviewedAt ?? FIXED).toISOString()}::timestamptz,
      ${JSON.stringify(input.fsrsBefore ?? card())}::jsonb,
      ${JSON.stringify(input.fsrsAfter ?? card({ due: LATER.toISOString(), reps: 1, state: 2 }))}::jsonb
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('journal non créé');
  return id;
}

async function insertGapEvent(
  tx: Queryable,
  input: {
    userId: string;
    notionId: string;
    kind?: string;
    nature?: string | null;
    evidence?: Record<string, unknown> | null;
    createdAt?: Date;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.gap_events (user_id, notion_id, kind, nature, evidence, created_at)
    values (
      ${input.userId}::uuid,
      ${input.notionId}::uuid,
      ${input.kind ?? 'detected'}::public.gap_event_kind,
      ${input.nature ?? 'forgetting'}::public.gap_nature,
      ${JSON.stringify(input.evidence ?? { reason: 'test' })}::jsonb,
      ${(input.createdAt ?? FIXED).toISOString()}::timestamptz
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('événement non créé');
  return id;
}

/** One answer row reachable from the review log to prove CL-5 (on delete set null). */
interface AnswerSeed {
  answerId: string;
  attemptId: string;
}

async function createAnswer(tx: DbTx, base: Base): Promise<AnswerSeed> {
  const brickRows = await tx.execute<{ id: string }>(sql`
    insert into public.bricks (owner_id, formation_id, type, purpose)
    values (${base.userId}::uuid, ${base.formationId}::uuid, 'recall_card', 'review')
    returning id::text as id
  `);
  const brickId = brickRows[0]?.id;
  if (brickId === undefined) throw new Error('brique non créée');
  const versionRows = await tx.execute<{ id: string }>(sql`
    insert into public.brick_versions (brick_id, version, payload, origin, created_by)
    values (${brickId}::uuid, 1, '{"front":"Clé 401"}'::jsonb, 'tutor', 'tutor')
    returning id::text as id
  `);
  const versionId = versionRows[0]?.id;
  if (versionId === undefined) throw new Error('version non créée');
  const activityRows = await tx.execute<{ id: string }>(sql`
    insert into public.activities (owner_id, formation_id, kind, items, status)
    values (
      ${base.userId}::uuid,
      ${base.formationId}::uuid,
      'global_quiz_session',
      ${JSON.stringify([{ brickId, brickVersionId: versionId }])}::jsonb,
      'ready'
    )
    returning id::text as id
  `);
  const activityId = activityRows[0]?.id;
  if (activityId === undefined) throw new Error('activité non créée');
  const attemptRows = await tx.execute<{ id: string }>(sql`
    insert into public.attempts (user_id, activity_id, attempt_no)
    values (${base.userId}::uuid, ${activityId}::uuid, 1)
    returning id::text as id
  `);
  const attemptId = attemptRows[0]?.id;
  if (attemptId === undefined) throw new Error('tentative non créée');
  const answerRows = await tx.execute<{ id: string }>(sql`
    insert into public.answers (attempt_id, brick_version_id, position, response)
    values (${attemptId}::uuid, ${versionId}::uuid, 1, '{"selfGrade":"good"}'::jsonb)
    returning id::text as id
  `);
  const answerId = answerRows[0]?.id;
  if (answerId === undefined) throw new Error('réponse non créée');
  return { answerId, attemptId };
}

async function seedState(tx: DbTx, base: Base, notionId: string) {
  return createNotionState(tx, {
    userId: base.userId,
    notionId,
    fsrs: card(),
    dueAt: FIXED,
    firstSeenAt: FIXED,
    lastSeenAt: FIXED,
    inReview: true,
  });
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-107] memory persistence', () => {
  it('CA-1 — les trois tables, quatre énumérations, contraintes, index, déclencheurs et politiques existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('notion_states', 'review_logs', 'gap_events')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(TABLES);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée sur les trois tables',
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
          'public.notion_states'::regclass,
          'public.review_logs'::regclass,
          'public.gap_events'::regclass
        )
      `);
      const names = constraints.map((row) => String(row.name));
      for (const expected of [
        'notion_states_pkey',
        'notion_states_mastery_check',
        'notion_states_success_count_check',
        'notion_states_revision_check',
        'notion_states_gap_confused_not_self_check',
        'notion_states_gap_confused_nature_check',
        'notion_states_gap_detected_at_check',
        'notion_states_gap_cleared_at_check',
        'notion_states_fsrs_check',
        'review_logs_time_ms_check',
        'review_logs_fsrs_before_check',
        'review_logs_fsrs_after_check',
        'gap_events_nature_check',
        'gap_events_evidence_check',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('notion_states', 'review_logs', 'gap_events')
      `);
      const byName = new Map(indexes.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'notion_states_pkey',
        'notion_states_due_idx',
        'notion_states_notion_id_idx',
        'review_logs_user_id_notion_id_reviewed_at_idx',
        'review_logs_answer_id_idx',
        'gap_events_user_id_notion_id_created_at_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      expect(byName.get('notion_states_due_idx') ?? '').toContain('WHERE');
      expect(byName.get('notion_states_due_idx') ?? '').toContain('in_review');

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
        'notion_states.set_updated_at',
        'notion_states.notion_states_confusion_same_formation',
        'review_logs.review_logs_append_only',
        'gap_events.gap_events_append_only',
      ]) {
        expect(triggerKeys.has(expected), expected).toBe(true);
      }

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public'
          and cl.relname in ('notion_states', 'review_logs', 'gap_events')
        order by cl.relname
      `);
      expect(policies.map((row) => String(row.name))).toEqual([
        'gap_events_owner_select',
        'notion_states_owner_all',
        'review_logs_owner_select',
      ]);

      // ET-3 — mastery is numeric(5,2); due_at and reviewed_at are timestamptz.
      const numeric = await tx.execute<Row>(sql`
        select table_name, column_name, numeric_precision, numeric_scale
        from information_schema.columns
        where table_schema = 'public' and table_name = 'notion_states'
          and column_name = 'mastery'
      `);
      expect(numeric).toEqual([
        {
          table_name: 'notion_states',
          column_name: 'mastery',
          numeric_precision: 5,
          numeric_scale: 2,
        },
      ]);
    });
  });

  it('CA-1 / CL-1 / CL-2 — carte invalide, maîtrise hors bornes et confusion incohérente refusées', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx, { notions: 2 });
      const first = base.notionIds[0] ?? '';
      const second = base.notionIds[1] ?? '';
      await seedState(tx, base, first);

      const negativeMastery = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states set mastery = -1
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(negativeMastery.code).toBe('23514');
      expect(negativeMastery.message).toContain('notion_states_mastery_check');

      const tooMuchMastery = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states set mastery = 101
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(tooMuchMastery.code).toBe('23514');
      expect(tooMuchMastery.message).toContain('notion_states_mastery_check');

      const negativeSuccess = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states set success_count = -1
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(negativeSuccess.code).toBe('23514');
      expect(negativeSuccess.message).toContain('notion_states_success_count_check');

      // CL-1 — malformed FSRS JSON is refused before it survives a commit.
      const missingKey = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states
          set fsrs = '{"due":"2026-11-11T12:20:00.000Z"}'::jsonb
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(missingKey.code).toBe('23514');
      expect(missingKey.message).toContain('notion_states_fsrs_check');

      const arrayCard = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states set fsrs = '[]'::jsonb
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(arrayCard.code).toBe('23514');
      expect(arrayCard.message).toContain('notion_states_fsrs_check');

      // EF-2 — a notion never confuses itself; only a confusion keeps another notion.
      const selfConfusion = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states
          set gap_nature = 'confusion', gap_confused_with = ${first}::uuid,
              gap_detected_at = now()
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(selfConfusion.code).toBe('23514');
      expect(selfConfusion.message).toContain('notion_states_gap_confused_not_self_check');

      const wrongNature = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states
          set gap_nature = 'forgetting', gap_confused_with = ${second}::uuid,
              gap_detected_at = now()
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(wrongNature.code).toBe('23514');
      expect(wrongNature.message).toContain('notion_states_gap_confused_nature_check');

      // EF-2 — the confused notion belongs to the same formation.
      const other = await createBase(tx, { notions: 1 });
      const foreignNotion = other.notionIds[0] ?? '';
      const foreignConfusion = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states
          set gap_nature = 'confusion', gap_confused_with = ${foreignNotion}::uuid,
              gap_detected_at = now()
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(foreignConfusion.code).toBe('23514');
      expect(foreignConfusion.message).toContain('gap_confusion_formation_mismatch');

      // ET-3 — the clearing instant never precedes the detection.
      const clearedBefore = await attempt(tx, () =>
        tx.execute(sql`
          update public.notion_states
          set gap_nature = 'forgetting', gap_detected_at = ${LATER.toISOString()}::timestamptz,
              gap_cleared_at = ${FIXED.toISOString()}::timestamptz
          where user_id = ${base.userId}::uuid and notion_id = ${first}::uuid
        `),
      );
      expect(clearedBefore.code).toBe('23514');
      expect(clearedBefore.message).toContain('notion_states_gap_cleared_at_check');

      // EF-3 — negative duration and malformed snapshots are refused.
      const negativeTime = await attempt(tx, () =>
        insertLog(tx, {
          userId: base.userId,
          notionId: first,
          reviewedAt: FIXED,
          timeMs: -1,
        }),
      );
      expect(negativeTime.code).toBe('23514');
      expect(negativeTime.message).toContain('review_logs_time_ms_check');

      // EF-4 — a detected event always names its nature.
      const noNature = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.gap_events (user_id, notion_id, kind, nature)
          values (${base.userId}::uuid, ${first}::uuid, 'detected', null)
        `),
      );
      expect(noNature.code).toBe('23514');
      expect(noNature.message).toContain('gap_events_nature_check');
    });
  });

  it('CA-2 / EF-5 / CL-7 / CL-8 — notions dues filtrées, ordre stable et index partiel utilisé', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx, { notions: 5 });
      const [first, second, third, fourth, fifth] = base.notionIds;
      if (
        first === undefined ||
        second === undefined ||
        third === undefined ||
        fourth === undefined ||
        fifth === undefined
      ) {
        throw new Error('programme incomplet');
      }
      await createNotionState(tx, {
        userId: base.userId,
        notionId: first,
        fsrs: card(),
        dueAt: FIXED,
        inReview: true,
      });
      await createNotionState(tx, {
        userId: base.userId,
        notionId: second,
        fsrs: card(),
        dueAt: FIXED,
        inReview: true,
      });
      await createNotionState(tx, {
        userId: base.userId,
        notionId: third,
        fsrs: card(),
        dueAt: LATER,
        inReview: true,
      });
      await createNotionState(tx, {
        userId: base.userId,
        notionId: fourth,
        fsrs: card(),
        dueAt: FIXED,
        inReview: true,
        suspended: true,
      });
      await createNotionState(tx, {
        userId: base.userId,
        notionId: fifth,
        fsrs: card(),
        dueAt: null,
        inReview: false,
      });

      const other = await createBase(tx, { notions: 1 });
      await createNotionState(tx, {
        userId: other.userId,
        notionId: other.notionIds[0] ?? '',
        fsrs: card(),
        dueAt: FIXED,
        inReview: true,
      });

      const due = await getDueNotionStates(tx, { userId: base.userId, now: FIXED });
      expect(due.map((state) => state.notionId)).toEqual([first, second].sort());
      expect(await countDueNotionStates(tx, { userId: base.userId, now: FIXED })).toBe(2);

      // CL-7 — a suspended or not-in-review notion never enters the daily quiz.
      expect(due.some((state) => state.notionId === fourth)).toBe(false);
      expect(due.some((state) => state.notionId === fifth)).toBe(false);

      // CL-8 — due_at stays the same UTC instant whatever the session time zone.
      await tx.execute(sql`set local time zone 'America/New_York'`);
      const inNewYork = await getDueNotionStates(tx, { userId: base.userId, now: FIXED });
      expect(inNewYork[0]?.dueAt?.toISOString()).toBe('2026-11-11T12:20:00.000Z');
      expect(inNewYork.map((state) => state.notionId)).toEqual([first, second].sort());

      // EF-5, ET-1 — the partial index serves the predicate without scanning other learners.
      await tx.execute(sql`set local enable_seqscan = off`);
      const plan = await tx.execute<Row>(sql`
        explain (format json)
        select notion_id
        from public.notion_states
        where user_id = ${base.userId}::uuid
          and in_review
          and not suspended
          and due_at <= ${FIXED.toISOString()}::timestamptz
        order by due_at, notion_id
      `);
      const planText = JSON.stringify(plan);
      expect(planText).toContain('notion_states_due_idx');
    });
  });

  it('CA-3 / ET-5 / CL-3 — deux réponses concurrentes ne s’écrasent pas et une seule applique', async () => {
    // Deliberately outside withRollback: the two transactions must really commit and race.
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, { notions: 1 });
      const notionId = base.notionIds[0] ?? '';
      await seedState(tx, base, notionId);
      return { ...base, notionId };
    });

    try {
      const apply = (due: Date, mastery: number, expectedRevision: number) =>
        serviceDb().transaction((tx) =>
          applyReview(tx, {
            userId: seed.userId,
            notionId: seed.notionId,
            expectedRevision,
            fsrsBefore: card(),
            fsrsAfter: card({
              due: due.toISOString(),
              reps: 1,
              state: 2,
              last_review: FIXED.toISOString(),
            }),
            mastery,
            successCount: 1,
            inReview: true,
            reviewedAt: LATER,
            source: 'global_quiz',
            grade: 'good',
            correct: true,
            timeMs: 3000,
          }),
        );

      const settled = await Promise.allSettled([apply(LATER, 60, 0), apply(LATER_STILL, 70, 0)]);
      const fulfilled = settled.filter((result) => result.status === 'fulfilled');
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(failureOf(rejected[0]?.reason).code).toBe('CONFLICT');

      const [state] = await serviceDb().execute<Row>(sql`
        select revision, due_at, mastery::text as mastery, fsrs ->> 'due' as fsrs_due
        from public.notion_states
        where user_id = ${seed.userId}::uuid and notion_id = ${seed.notionId}::uuid
      `);
      expect(Number(state?.revision)).toBe(1);
      expect(Number(state?.mastery)).toBe(60);
      expect(new Date(String(state?.due_at)).toISOString()).toBe(LATER.toISOString());
      expect(await count(serviceDb(), 'review_logs', 'user_id', seed.userId)).toBe(1);

      // The loser retries on top of the applied revision: both measurements are kept.
      const retry = await serviceDb().transaction((tx) =>
        applyReview(tx, {
          userId: seed.userId,
          notionId: seed.notionId,
          expectedRevision: 1,
          fsrsBefore: card({ due: LATER.toISOString(), reps: 1, state: 2 }),
          fsrsAfter: card({
            due: LATER_STILL.toISOString(),
            reps: 2,
            state: 2,
            last_review: LATER.toISOString(),
          }),
          mastery: 70,
          successCount: 2,
          inReview: true,
          reviewedAt: LATER_STILL,
          source: 'global_quiz',
          grade: 'good',
          correct: true,
          timeMs: 2800,
        }),
      );
      expect(retry.state.revision).toBe(2);
      expect(retry.state.dueAt?.toISOString()).toBe(LATER_STILL.toISOString());
      expect(await count(serviceDb(), 'review_logs', 'user_id', seed.userId)).toBe(2);

      const history = await serviceDb().transaction((tx) =>
        getReviewHistory(tx, { userId: seed.userId, notionId: seed.notionId }),
      );
      expect(history.map((log) => log.fsrsAfter?.reps)).toEqual([1, 2]);
      expect(history[0]?.fsrsBefore?.due).toBe('2026-11-11T12:20:00.000Z');
      expect(history[1]?.fsrsAfter?.due).toBe(LATER_STILL.toISOString());
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CA-3 / CL-1 — état, journal et événement sont atomiques : un échec ne laisse aucun orphelin', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, { notions: 1 });
      const notionId = base.notionIds[0] ?? '';
      await seedState(tx, base, notionId);
      return { ...base, notionId };
    });
    const missingAnswer = '6f1d0f2a-0000-4000-8000-00000000ffff';

    try {
      // A review whose log insert fails (missing answer FK) must roll its state update back.
      await expect(
        serviceDb().transaction((tx) =>
          applyReview(tx, {
            userId: seed.userId,
            notionId: seed.notionId,
            expectedRevision: 0,
            fsrsBefore: card(),
            fsrsAfter: card({ due: LATER.toISOString(), reps: 1, state: 2 }),
            mastery: 55,
            successCount: 1,
            inReview: true,
            reviewedAt: LATER,
            source: 'validation',
            grade: 'hard',
            correct: true,
            answerId: missingAnswer,
          }),
        ),
      ).rejects.toThrow();

      const [afterFailure] = await serviceDb().execute<Row>(sql`
        select revision, mastery::text as mastery
        from public.notion_states
        where user_id = ${seed.userId}::uuid and notion_id = ${seed.notionId}::uuid
      `);
      expect(Number(afterFailure?.revision)).toBe(0);
      expect(Number(afterFailure?.mastery)).toBe(0);
      expect(await count(serviceDb(), 'review_logs', 'user_id', seed.userId)).toBe(0);

      // A gap update whose event insert fails leaves neither state nor event.
      await expect(
        serviceDb().transaction(async (tx) => {
          await detectGap(tx, {
            userId: seed.userId,
            notionId: seed.notionId,
            expectedRevision: 0,
            nature: 'confusion',
            evidence: { reason: 'distracteur' },
            detectedAt: LATER,
          });
          throw new Error('rollback volontaire');
        }),
      ).rejects.toThrow(/rollback volontaire/);
      const [afterGap] = await serviceDb().execute<Row>(sql`
        select gap_nature::text as gap_nature, revision
        from public.notion_states
        where user_id = ${seed.userId}::uuid and notion_id = ${seed.notionId}::uuid
      `);
      expect(afterGap?.gap_nature).toBeNull();
      expect(Number(afterGap?.revision)).toBe(0);
      expect(await count(serviceDb(), 'gap_events', 'user_id', seed.userId)).toBe(0);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CA-4 / EF-4 / CL-4 — l’historique garde avant/après, la levée est idempotente et l’état suit le dernier événement', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx, { notions: 2 });
      const notionId = base.notionIds[0] ?? '';
      const confusedWith = base.notionIds[1] ?? '';
      const seeded = await seedState(tx, base, notionId);

      const reviewed = await applyReview(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: seeded.state.revision,
        fsrsBefore: card(),
        fsrsAfter: card({
          due: LATER.toISOString(),
          reps: 1,
          stability: 2.5,
          difficulty: 4.2,
          elapsed_days: 0,
          scheduled_days: 7,
          state: 2,
          last_review: FIXED.toISOString(),
        }),
        mastery: 42.25,
        successCount: 1,
        inReview: true,
        reviewedAt: LATER,
        source: 'exercise',
        grade: 'good',
        correct: true,
        timeMs: 4200,
      });
      expect(reviewed.log.fsrsBefore?.due).toBe('2026-11-11T12:20:00.000Z');
      expect(reviewed.log.fsrsAfter).toMatchObject({
        due: LATER.toISOString(),
        reps: 1,
        stability: 2.5,
        difficulty: 4.2,
        state: 2,
        last_review: FIXED.toISOString(),
      });

      // EF-2 — a confusion keeps the other notion of the same formation.
      const detected = await detectGap(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: reviewed.state.revision,
        nature: 'confusion',
        confusedWith,
        evidence: { chosen: '401', expected: '512' },
        detectedAt: LATER,
      });
      expect(detected.event?.kind).toBe('detected');
      expect(detected.state.gapNature).toBe('confusion');
      expect(detected.state.gapConfusedWith).toBe(confusedWith);
      expect(detected.state.gapDetectedAt?.toISOString()).toBe(LATER.toISOString());
      expect(detected.state.gapClearedAt).toBeNull();

      // EF-4 — a nature change appends `nature_changed` and clears the confused notion.
      const changed = await detectGap(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: detected.state.revision,
        nature: 'forgetting',
        evidence: { fsrs: 'lapse' },
        detectedAt: LATER_STILL,
      });
      expect(changed.event?.kind).toBe('nature_changed');
      expect(changed.state.gapNature).toBe('forgetting');
      expect(changed.state.gapConfusedWith).toBeNull();
      expect(changed.state.gapDetectedAt?.toISOString()).toBe(LATER.toISOString());

      const cleared = await clearGap(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: changed.state.revision,
        clearedAt: LATER_STILL,
        evidence: { successes: 2 },
      });
      expect(cleared.event?.kind).toBe('cleared');
      expect(cleared.event?.nature).toBe('forgetting');
      expect(cleared.state.gapClearedAt?.toISOString()).toBe(LATER_STILL.toISOString());

      // CL-4 — clearing again is a no-op: no second event, no revision bump.
      const again = await clearGap(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: cleared.state.revision,
        clearedAt: LATER_STILL,
      });
      expect(again.changed).toBe(false);
      expect(again.event).toBeNull();
      expect(again.state.revision).toBe(cleared.state.revision);

      const events = await getGapEvents(tx, { userId: base.userId, notionId });
      expect(events.map((event) => event.kind)).toEqual(['detected', 'nature_changed', 'cleared']);
      expect(events[0]?.evidence).toEqual({ chosen: '401', expected: '512' });

      const history = await getReviewHistory(tx, { userId: base.userId, notionId });
      expect(history).toHaveLength(1);
      expect(history[0]?.fsrsBefore?.reps).toBe(0);
      expect(history[0]?.fsrsAfter?.reps).toBe(1);
      expect(history[0]?.grade).toBe('good');

      // ET-3 — the journal and the gap history are append-only for every writer.
      const logUpdate = await attempt(tx, () =>
        tx.execute(sql`
          update public.review_logs set grade = 'easy'
          where user_id = ${base.userId}::uuid and notion_id = ${notionId}::uuid
        `),
      );
      expect(logUpdate.code).toBe('23514');
      expect(logUpdate.message).toContain('review_log_immutable');

      const eventUpdate = await attempt(tx, () =>
        tx.execute(sql`
          update public.gap_events set nature = 'application'
          where user_id = ${base.userId}::uuid and notion_id = ${notionId}::uuid
        `),
      );
      expect(eventUpdate.code).toBe('23514');
      expect(eventUpdate.message).toContain('gap_event_immutable');

      // ADR-0022 — the set_updated_at trigger moves the mutation instant.
      const [row] = await tx.execute<Row>(sql`
        select updated_at from public.notion_states
        where user_id = ${base.userId}::uuid and notion_id = ${notionId}::uuid
      `);
      expect(new Date(String(row?.updated_at)).getTime()).toBeGreaterThan(FIXED.getTime());
    });
  });

  it('CL-5 / CL-6 — answer_id passe à null sans perdre le journal, RLS isole deux JWT', async () => {
    const alice = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, { notions: 2 });
      const notionId = base.notionIds[0] ?? '';
      const seed = await seedState(tx, base, notionId);
      const answer = await createAnswer(tx, base);
      const reviewed = await applyReview(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: seed.state.revision,
        fsrsBefore: card(),
        fsrsAfter: card({ due: LATER.toISOString(), reps: 1, state: 2 }),
        mastery: 80,
        successCount: 1,
        inReview: true,
        reviewedAt: LATER,
        source: 'self_test',
        grade: 'easy',
        correct: true,
        answerId: answer.answerId,
      });
      await detectGap(tx, {
        userId: base.userId,
        notionId,
        expectedRevision: reviewed.state.revision,
        nature: 'forgetting',
        evidence: { lapse: true },
        detectedAt: LATER,
      });
      return { ...base, notionId, answer };
    });

    const bob = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, { notions: 1 });
      const notionId = base.notionIds[0] ?? '';
      await seedState(tx, base, notionId);
      await insertLog(tx, { userId: base.userId, notionId });
      await insertGapEvent(tx, { userId: base.userId, notionId });
      return { ...base, notionId };
    });

    try {
      // CL-5 — deleting the attempt cascades the answer and nulls the log reference.
      await serviceDb().execute(
        sql`delete from public.attempts where id = ${alice.answer.attemptId}::uuid`,
      );
      const [kept] = await serviceDb().execute<Row>(sql`
        select answer_id, grade::text as grade, fsrs_before, fsrs_after
        from public.review_logs
        where user_id = ${alice.userId}::uuid and notion_id = ${alice.notionId}::uuid
      `);
      expect(kept?.answer_id).toBeNull();
      expect(kept?.grade).toBe('easy');
      expect(kept?.fsrs_after).toMatchObject({ reps: 1, state: 2 });

      // EF-6, CL-6 — Alice reads exactly her rows, including by Bob's identifiers.
      const aliceView = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.notion_states) as states,
            (select count(*)::int from public.review_logs) as logs,
            (select count(*)::int from public.gap_events) as events,
            (select count(*)::int from public.notion_states where user_id = ${bob.userId}::uuid) as foreign_states,
            (select count(*)::int from public.review_logs where user_id = ${bob.userId}::uuid) as foreign_logs,
            (select count(*)::int from public.gap_events where user_id = ${bob.userId}::uuid) as foreign_events
        `);
        return rows[0];
      });
      expect(aliceView).toMatchObject({
        states: 1,
        logs: 1,
        events: 1,
        foreign_states: 0,
        foreign_logs: 0,
        foreign_events: 0,
      });

      // Reading Bob's due state by its notion identifier returns nothing.
      const foreignDue = await userDb({ userId: alice.userId }).run((tx) =>
        getDueNotionStates(tx, { userId: bob.userId, now: FIXED }),
      );
      expect(foreignDue).toEqual([]);

      // A foreign notion state cannot be read or modified through userDb.
      const foreignRead = await userDb({ userId: alice.userId }).run((tx) =>
        tx.execute<Row>(sql`
          select user_id::text as user_id from public.notion_states
          where notion_id = ${bob.notionId}::uuid
        `),
      );
      expect(foreignRead).toEqual([]);
      const foreignUpdate = await userDb({ userId: alice.userId }).run((tx) =>
        tx.execute<Row>(sql`
          update public.notion_states set suspended = true
          where user_id = ${bob.userId}::uuid and notion_id = ${bob.notionId}::uuid
          returning user_id::text as user_id
        `),
      );
      expect(foreignUpdate).toEqual([]);

      // Writing to the journal or the event history is reserved to the service role (ADR-0112).
      const forbiddenLog = await failureOfUserDb(
        (tx) =>
          insertLog(tx, { userId: alice.userId, notionId: alice.notionId, reviewedAt: LATER }),
        alice.userId,
      );
      expect(forbiddenLog.code).toBe('42501');
      const forbiddenEvent = await failureOfUserDb(
        (tx) =>
          insertGapEvent(tx, { userId: alice.userId, notionId: alice.notionId, createdAt: LATER }),
        alice.userId,
      );
      expect(forbiddenEvent.code).toBe('42501');
      const forbiddenForeignState = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.notion_states (user_id, notion_id, fsrs, due_at, in_review)
            values (
              ${bob.userId}::uuid,
              ${bob.notionId}::uuid,
              ${JSON.stringify(card())}::jsonb,
              ${FIXED.toISOString()}::timestamptz,
              true
            )
          `),
        alice.userId,
      );
      expect(forbiddenForeignState.code).toBe('42501');

      // Alice still writes her own current state.
      const ownUpdate = await userDb({ userId: alice.userId }).run((tx) =>
        tx.execute<Row>(sql`
          update public.notion_states set suspended = true
          where user_id = ${alice.userId}::uuid and notion_id = ${alice.notionId}::uuid
          returning revision
        `),
      );
      expect(ownUpdate).toHaveLength(1);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${alice.userId}::uuid, ${bob.userId}::uuid)`,
      );
    }
  });

  it('CL-5 — supprimer le compte efface états, journal et événements sans orphelin', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, { notions: 1 });
      const notionId = base.notionIds[0] ?? '';
      await seedState(tx, base, notionId);
      await insertLog(tx, { userId: base.userId, notionId });
      await insertGapEvent(tx, { userId: base.userId, notionId });
      return { ...base, notionId };
    });

    await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    expect(await count(serviceDb(), 'notion_states', 'user_id', seed.userId)).toBe(0);
    expect(await count(serviceDb(), 'review_logs', 'user_id', seed.userId)).toBe(0);
    expect(await count(serviceDb(), 'gap_events', 'user_id', seed.userId)).toBe(0);
  });
});
