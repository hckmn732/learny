// Notification producers service (SPEC-706 EF-1 to EF-4, ET-1 to ET-4).
//
// The shared producer module of `@learny/notifications` builds the input of `notify` (SPEC-209);
// this service is the entry point of the API: it checks the ownership of the formation, sends the
// facts through `notify` (preferences, quiet hours, cap and dedupe stay in SPEC-209) and delegates
// the validation quiz reminders to the notifications package (BR-NOT-07, CA-2).
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  NotificationProducerFacts,
  ValidationQuizReminderRequest,
  type DevNotificationsGenerationInput,
  type DevNotificationsGenerationOutput,
  type NotificationProducerType,
  type ProducedNotification,
  notificationTypeOf,
} from '@learny/contracts';
import { AppError, err, ok, type Clock, type LearnyLogger, type Result } from '@learny/core';
import { schema, serviceDb, sql, type Db, type UserDatabase } from '@learny/db';
import { notify } from '@learny/notifications/notify';
import { produceNotificationInput } from '@learny/notifications/producers';
import {
  profileTimezone,
  scheduleValidationQuizReminder as scheduleReminder,
  syncValidationQuizReminders as syncReminders,
  type ReminderOutcome,
  type ReminderSyncSummary,
} from '@learny/notifications/producers/reminders';

const { notifications } = schema;

/** ET-1 — the service runs with the learner RLS client or with the job system client. */
export interface NotificationProducerContext {
  requestId: string;
  userId: string | null;
  db: UserDatabase | null;
  clock: Clock;
  logger: LearnyLogger;
  /** Owner-role client of the jobs; the route uses the RLS client for the ownership check. */
  sdb?: Db;
}

export type { ReminderOutcome, ReminderSyncSummary };

const PRODUCER_BATCH_MAX = 32;

function systemDb(ctx: NotificationProducerContext): Db {
  return ctx.sdb ?? serviceDb();
}

function parseOrThrow<T>(schemaValue: z.ZodType<T>, value: unknown): T {
  const parsed = schemaValue.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Notification invalide.', {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** ET-1 — a formation of another learner does not exist for this caller (404, CL-1). */
async function assertFormationAccess(
  ctx: NotificationProducerContext,
  formationId: string | null | undefined,
): Promise<void> {
  if (formationId === undefined || formationId === null || ctx.userId === null) return;
  const rows = await systemDb(ctx).execute<{ ok: number }>(sql`
    select 1 as ok
    from public.formations f
    where f.id = ${formationId}::uuid
      and (
        f.owner_id = ${ctx.userId}::uuid
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = f.group_id
            and gm.user_id = ${ctx.userId}::uuid
            and gm.left_at is null
        )
      )
    limit 1
  `);
  if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
}

function assertUserScope(ctx: NotificationProducerContext, userId: string): void {
  if (ctx.userId !== null && ctx.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Profil introuvable.');
  }
}

interface NotifiedRow {
  id: string;
  title: string;
  href: string;
  icon: string;
}

async function producedRow(
  ctx: NotificationProducerContext,
  userId: string,
  notificationId: string,
): Promise<NotifiedRow> {
  const rows = await systemDb(ctx)
    .select({
      id: notifications.id,
      title: notifications.title,
      href: notifications.href,
      icon: notifications.icon,
    })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Notification introuvable.');
  return row;
}

async function produceOne(
  ctx: NotificationProducerContext,
  facts: NotificationProducerFacts,
  now: Date,
): Promise<ProducedNotification> {
  assertUserScope(ctx, facts.userId);
  await assertFormationAccess(ctx, facts.formationId);
  const produced = produceNotificationInput(facts, now);
  const result = await notify(
    { requestId: ctx.requestId, sdb: systemDb(ctx), clock: ctx.clock, logger: ctx.logger },
    produced.input,
  );
  if (!result.ok) throw result.error;
  const row = await producedRow(ctx, facts.userId, result.value.notificationId);
  return {
    type: notificationTypeOf(facts.kind),
    kind: facts.kind,
    dedupeKey: produced.input.dedupeKey ?? '',
    notificationId: row.id,
    created: result.value.created,
    href: row.href,
    title: row.title,
    icon: row.icon,
  };
}

/**
 * EF-1, ET-3 — runs one producer or a bounded batch. A replay of the same facts returns
 * `created: false` for every row and writes nothing new (CA-1, CL-3).
 */
export async function produceNotifications(
  ctx: NotificationProducerContext,
  rawFacts: unknown,
): Promise<Result<ProducedNotification[]>> {
  try {
    const facts = parseOrThrow(
      z.array(NotificationProducerFacts).min(1).max(PRODUCER_BATCH_MAX),
      rawFacts,
    );
    const now = ctx.clock.now();
    const produced: ProducedNotification[] = [];
    for (const item of facts) produced.push(await produceOne(ctx, item, now));
    return ok(produced);
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

/**
 * EF-2, BR-NOT-07 — computes the reminder of a planned quiz and delegates the write to the
 * notifications package. A stale start returns `CONFLICT` (CL-2); a past eligibility instant is
 * not sent late (CL-5).
 */
export async function scheduleValidationQuizReminder(
  ctx: NotificationProducerContext,
  rawInput: unknown,
): Promise<Result<ReminderOutcome>> {
  try {
    const input = parseOrThrow(ValidationQuizReminderRequest, rawInput);
    assertUserScope(ctx, input.userId);
    await assertFormationAccess(ctx, input.formationId);
    const outcome = await scheduleReminder(
      { requestId: ctx.requestId, sdb: systemDb(ctx), clock: ctx.clock, logger: ctx.logger },
      input,
    );
    return ok(outcome);
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

/** ET-6 — hourly generation of the reminders of the next hour (job entry point). */
export async function syncRemindersForJobs(
  ctx: NotificationProducerContext,
  options: { batchSize?: number } = {},
): Promise<Result<ReminderSyncSummary>> {
  try {
    const summary = await syncReminders(
      { requestId: ctx.requestId, sdb: systemDb(ctx), clock: ctx.clock, logger: ctx.logger },
      options,
    );
    return ok(summary);
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

/** ET-2 — the profile zone, exposed for the demonstration route and the tests. */
export function userTimezone(ctx: NotificationProducerContext, userId: string): Promise<string> {
  return profileTimezone(systemDb(ctx), userId);
}

interface DemoFact {
  type: NotificationProducerType;
  facts: NotificationProducerFacts;
}

function demoTypes(): NotificationProducerType[] {
  return [
    'validation_soon',
    'course_ready',
    'global_quiz_today',
    'new_gap',
    'session_planned',
    'module_validated',
    'session_to_reschedule',
    'weekly_review',
    'milestone',
    'ai_cost_alert',
    'ai_task_failed',
    'export_ready',
    'group_invitation',
  ];
}

/**
 * EF-8 — demonstration route: the thirteen producers and an optional reminder for the signed-in
 * learner. The idempotency key of the route and the dedupe keys of the notifications make a replay
 * harmless (CA-1, CA-3).
 */
export async function generateNotificationDemo(
  ctx: NotificationProducerContext,
  input: DevNotificationsGenerationInput,
): Promise<DevNotificationsGenerationOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const userId = ctx.userId;
  const now = ctx.clock.now();
  const timezone = await userTimezone(ctx, userId);
  const requested = new Set<NotificationProducerType>(input.types ?? demoTypes());
  const startsAt = input.quiz?.startsAt ?? new Date(now.getTime() + 60 * 60_000).toISOString();
  const slotId = input.quiz?.slotId ?? '00000000-0000-4000-8000-000000000001';

  const facts = demoFacts(userId, now, timezone, slotId, startsAt).filter((fact) =>
    requested.has(fact.type),
  );
  const produced: ProducedNotification[] = [];
  for (const fact of facts) produced.push(await produceOne(ctx, fact.facts, now));

  let reminder: DevNotificationsGenerationOutput['reminder'] = null;
  if (requested.has('validation_soon')) {
    const outcome = await scheduleReminder(
      { requestId: ctx.requestId, sdb: systemDb(ctx), clock: ctx.clock, logger: ctx.logger },
      {
        userId,
        slotId,
        startsAt,
        timezone,
        ...(input.quiz?.moduleTitle === undefined ? {} : { moduleTitle: input.quiz.moduleTitle }),
      },
    );
    reminder = {
      notificationId: outcome.notificationId,
      created: outcome.created,
      schedule: outcome.schedule,
      cancelled: outcome.cancelled,
    };
  }
  return { notifications: produced, reminder };
}

/**
 * Deterministic demonstration facts: no AI, no private content, only labels shaped like the
 * mockup. The validation reminder is generated separately by `input.quiz`.
 */
function demoFacts(
  userId: string,
  now: Date,
  timezone: string,
  slotId: string,
  startsAt: string,
): DemoFact[] {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  return [
    {
      type: 'course_ready',
      facts: {
        kind: 'course_ready',
        userId,
        courseId: '00000000-0000-4000-8000-000000000002',
        moduleTitle: 'Saisie des pièces comptables',
      },
    },
    {
      type: 'global_quiz_today',
      facts: { kind: 'global_quiz_today', userId, localDay: day, notions: 14, minutes: 10 },
    },
    {
      type: 'new_gap',
      facts: {
        kind: 'new_gap',
        userId,
        gapId: '00000000-0000-4000-8000-000000000003',
        notionTitle: 'Clé de comptabilisation',
        formationTitle: 'SAP S/4HANA Finance',
      },
    },
    {
      type: 'session_planned',
      facts: {
        kind: 'session_planned',
        userId,
        slotId: '00000000-0000-4000-8000-000000000004',
        title: 'Rétrospectives',
        startsAt,
        timezone,
      },
    },
    {
      type: 'module_validated',
      facts: {
        kind: 'module_validated',
        userId,
        moduleId: '00000000-0000-4000-8000-000000000005',
        modulePosition: 2,
        moduleTitle: 'Comptabilité générale',
        score: 91,
        nextModulePosition: 3,
        nextModuleTitle: 'Saisie des pièces comptables',
      },
    },
    {
      type: 'session_to_reschedule',
      facts: {
        kind: 'session_to_reschedule',
        userId,
        slotId: '00000000-0000-4000-8000-000000000006',
        title: 'Ledgers parallèles',
      },
    },
    {
      type: 'weekly_review',
      facts: { kind: 'weekly_review', userId, weekStart: day, studyLabel: '13 h d’étude' },
    },
    {
      type: 'milestone',
      facts: {
        kind: 'milestone',
        userId,
        milestoneId: '00000000-0000-4000-8000-000000000007',
        label: 'Sept jours d’affilée',
      },
    },
    { type: 'ai_cost_alert', facts: { kind: 'ai_cost_alert', userId, localDay: day, percent: 82 } },
    {
      type: 'ai_task_failed',
      facts: {
        kind: 'ai_task_failed',
        userId,
        taskId: '00000000-0000-4000-8000-000000000008',
        taskLabel: 'La correction de votre quiz',
        modelLabel: 'IA fournie',
      },
    },
    {
      type: 'export_ready',
      facts: { kind: 'export_ready', userId, exportId: '00000000-0000-4000-8000-000000000009' },
    },
    {
      type: 'group_invitation',
      facts: {
        kind: 'group_invitation',
        userId,
        groupId: '00000000-0000-4000-8000-000000000010',
        invitedUserId: userId,
        groupTitle: 'Promotion SAP 2026',
      },
    },
  ];
}
