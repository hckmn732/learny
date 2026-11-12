// Demonstration data of SPEC-411: a real graded attempt, the real learning service and the real
// transaction, on an isolated account removed at the end of the request. `serviceDb` is used only
// to create and clean the fixture (the `_dev` boundary of ADR-0049); every write of the service
// itself goes through `createServiceContext` and therefore through RLS.
import { randomUUID } from 'node:crypto';

import { serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { withParams } from '@learny/learning-engine';
import { createNotionCard, planSchedule } from '@learny/learning-engine';
import {
  createServiceContext,
  applyLearningResult,
  persistPlan,
  toPersistenceCard,
} from '@learny/services';
import { createBrick } from '@learny/testing';

const AT = '2026-11-11T12:20:00.000Z';
const SUBMITTED = '2026-11-11T11:22:00.000Z';
const FIRST_ANSWER = '2026-11-11T11:20:00.000Z';
const SECOND_ANSWER = '2026-11-11T11:21:00.000Z';
const PREFIX = 'sdd-411-demo-';

export interface Spec411State {
  notionId: string;
  label: string;
  mastery: number;
  dueAt: string | null;
  gapNature: string | null;
  gapClearedAt: string | null;
}

export interface Spec411Event {
  name: string;
  sentAt: string | null;
  nature: string | null;
}

export interface Spec411Slot {
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
}

export interface Spec411Data {
  attemptId: string;
  attemptStatus: string;
  answerCount: number;
  reviewCount: number;
  pendingAnswers: number;
  secondStatus: string;
  secondReviewCount: number;
  dailyDay: string;
  dailyMinutes: number;
  before: Spec411State[];
  after: Spec411State[];
  gapEvents: { notionId: string; kind: string; nature: string | null }[];
  events: Spec411Event[];
  slots: Spec411Slot[];
  slotSummary: string;
}

interface Fixture {
  userId: string;
  attemptId: string;
  formationId: string;
  moduleId: string;
  chapterId: string;
  before: Spec411State[];
  slotSummary: string;
}

async function readStates(userId: string): Promise<Spec411State[]> {
  const rows = await serviceDb().execute<{
    notion_id: string;
    label: string;
    mastery: string;
    due_at: Date | string | null;
    gap_nature: string | null;
    gap_cleared_at: Date | string | null;
  }>(sql`
    select
      ns.notion_id::text as notion_id,
      n.label,
      ns.mastery::text as mastery,
      ns.due_at,
      ns.gap_nature::text as gap_nature,
      ns.gap_cleared_at
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
    order by n.position, n.id
  `);
  return rows.map((row) => ({
    notionId: row.notion_id,
    label: row.label,
    mastery: Number(row.mastery),
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    gapNature: row.gap_nature,
    gapClearedAt: row.gap_cleared_at === null ? null : new Date(row.gap_cleared_at).toISOString(),
  }));
}

async function createFixture(): Promise<Fixture> {
  const email = `${PREFIX}${randomUUID()}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, firstName: 'Alex' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance — démonstration',
    });
    const [first, second] = programme.notionIds;
    const moduleId = programme.moduleIds[0];
    const chapterId = programme.chapterIds[0];
    if (
      first === undefined ||
      second === undefined ||
      moduleId === undefined ||
      chapterId === undefined
    ) {
      throw new Error('programme de démonstration incomplet');
    }
    const correctBrick = await createBrick(tx, {
      ownerId: user.id,
      formationId: programme.formationId,
      type: 'choice_question',
      notionIds: [first],
    });
    const wrongBrick = await createBrick(tx, {
      ownerId: user.id,
      formationId: programme.formationId,
      type: 'choice_question',
      notionIds: [second],
    });
    const items = [
      { brickId: correctBrick.id, brickVersionId: correctBrick.versionId, points: 1 },
      { brickId: wrongBrick.id, brickVersionId: wrongBrick.versionId, points: 1 },
    ];
    const [activity] = await tx.execute<{ id: string }>(sql`
      insert into public.activities (
        owner_id, formation_id, module_id, kind, config, items, status, for_date
      ) values (
        ${user.id}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', '{"questionCount":2}'::jsonb, ${JSON.stringify(items)}::jsonb,
        'ready', '2026-11-11'
      )
      returning id::text as id
    `);
    if (activity === undefined) throw new Error('activité non créée');
    const [attempt] = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, duration_ms,
        score, passed, per_notion, hints_used
      ) values (
        ${user.id}::uuid, ${activity.id}::uuid, 1, 'graded',
        ${'2026-11-11T11:18:00.000Z'}::timestamptz, ${SUBMITTED}::timestamptz, 240000,
        50, false, '{}'::jsonb, 0
      )
      returning id::text as id
    `);
    if (attempt === undefined) throw new Error('tentative non créée');
    const answers = [
      {
        versionId: correctBrick.versionId,
        position: 1,
        correct: true,
        score: 100,
        timeMs: 42000,
        answeredAt: FIRST_ANSWER,
      },
      {
        versionId: wrongBrick.versionId,
        position: 2,
        correct: false,
        score: 0,
        timeMs: 38000,
        answeredAt: SECOND_ANSWER,
      },
    ];
    for (const answer of answers) {
      await tx.execute(sql`
        insert into public.answers (
          attempt_id, brick_version_id, position, response, is_correct, score, max_score,
          time_ms, graded_by, feedback, answered_at
        ) values (
          ${attempt.id}::uuid, ${answer.versionId}::uuid, ${answer.position}, '{}'::jsonb,
          ${answer.correct}, ${answer.score}, 100, ${answer.timeMs}, 'code', '{}'::jsonb,
          ${answer.answeredAt}::timestamptz
        )
      `);
    }

    const card = toPersistenceCard(createNotionCard('2026-11-10T09:00:00.000Z', 0.9));
    for (const notionId of [first, second]) {
      await tx.execute(sql`
        insert into public.notion_states (
          user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
          success_count, in_review
        ) values (
          ${user.id}::uuid, ${notionId}::uuid, ${JSON.stringify(card)}::jsonb,
          ${'2026-11-10T09:00:00.000Z'}::timestamptz, 0,
          ${'2026-11-09T09:00:00.000Z'}::timestamptz,
          ${'2026-11-09T09:00:00.000Z'}::timestamptz, 0, true
        )
      `);
    }

    return {
      userId: user.id,
      attemptId: attempt.id,
      formationId: programme.formationId,
      moduleId,
      chapterId,
      before: [],
      slotSummary: '',
    };
  });
}

/** Full demonstration; the isolated account is deleted whatever happens. */
export async function loadSpec411Demo(): Promise<Spec411Data> {
  let userId: string | null = null;
  try {
    const fixture = await createFixture();
    userId = fixture.userId;
    fixture.before = await readStates(fixture.userId);

    const ctx = createServiceContext({
      userId: fixture.userId,
      requestId: `sdd-411-${randomUUID().slice(0, 8)}`,
      clock: { now: () => new Date(AT) },
    });
    const plan = planSchedule({
      formations: [
        {
          formationId: fixture.formationId,
          title: 'SAP S/4HANA Finance',
          endDate: '2026-12-20',
          status: 'active',
          modules: [
            {
              moduleId: fixture.moduleId,
              position: 1,
              title: 'Partie 1',
              hours: 4,
              hasExercise: true,
              chapters: [{ chapterId: fixture.chapterId, position: 1, title: 'Chapitre 1.1' }],
            },
          ],
        },
      ],
      preferences: {
        tz: 'Europe/Paris',
        availability: { hoursPerDay: 2, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] },
      },
      params: withParams('planner'),
      now: AT,
    });
    const persisted = await persistPlan(ctx, fixture.formationId, plan, 'sdd-411');
    if (!persisted.ok) throw persisted.error;
    fixture.slotSummary = `${String(persisted.value.created)} créés, ${String(
      persisted.value.updated,
    )} mis à jour`;

    const applied = await applyLearningResult(ctx, fixture.attemptId);
    if (!applied.ok) throw applied.error;
    const second = await applyLearningResult(ctx, fixture.attemptId);
    if (!second.ok) throw second.error;

    const after = await readStates(fixture.userId);
    const daily = await serviceDb().execute<{ day: string; minutes: number }>(sql`
      select day::text as day, minutes from public.daily_activity
      where user_id = ${fixture.userId}::uuid
    `);
    const attempt = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.attempts where id = ${fixture.attemptId}::uuid
    `);
    const answers = await serviceDb().execute<{ count: string }>(sql`
      select count(*)::int as count from public.answers
      where attempt_id = ${fixture.attemptId}::uuid
    `);
    const events = await serviceDb().execute<{
      name: string;
      sent_at: Date | string | null;
      data: Record<string, unknown>;
    }>(sql`
      select name, sent_at, data from public.event_outbox
      where user_id = ${fixture.userId}::uuid order by created_at
    `);
    const gaps = await serviceDb().execute<{
      notion_id: string;
      kind: string;
      nature: string | null;
    }>(sql`
      select notion_id::text as notion_id, kind::text as kind, nature::text as nature
      from public.gap_events where user_id = ${fixture.userId}::uuid order by created_at
    `);
    const slots = await serviceDb().execute<{
      title: string;
      kind: string;
      status: string;
      starts_at: Date | string;
      ends_at: Date | string;
      created_by: string;
    }>(sql`
      select title, kind::text as kind, status::text as status, starts_at, ends_at,
             created_by::text as created_by
      from public.schedule_slots
      where user_id = ${fixture.userId}::uuid
      order by starts_at
      limit 6
    `);

    return {
      attemptId: fixture.attemptId,
      attemptStatus: attempt[0]?.status ?? 'graded',
      answerCount: Number(answers[0]?.count ?? '0'),
      reviewCount: applied.value.reviewCount,
      pendingAnswers: applied.value.pendingAnswers,
      secondStatus: second.value.status,
      secondReviewCount: second.value.reviewCount,
      dailyDay: daily[0]?.day ?? '',
      dailyMinutes: daily[0]?.minutes ?? 0,
      before: fixture.before,
      after,
      gapEvents: gaps.map((gap) => ({
        notionId: gap.notion_id,
        kind: gap.kind,
        nature: gap.nature,
      })),
      events: events.map((event) => ({
        name: event.name,
        sentAt: event.sent_at === null ? null : new Date(event.sent_at).toISOString(),
        nature: typeof event.data.nature === 'string' ? event.data.nature : null,
      })),
      slots: slots.map((slot) => ({
        title: slot.title,
        kind: slot.kind,
        status: slot.status,
        startsAt: new Date(slot.starts_at).toISOString(),
        endsAt: new Date(slot.ends_at).toISOString(),
        createdBy: slot.created_by,
      })),
      slotSummary: fixture.slotSummary,
    };
  } finally {
    if (userId !== null) {
      await serviceDb().execute(sql`delete from public.groups where owner_id = ${userId}::uuid`);
      await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
    }
  }
}
