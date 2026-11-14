// Reminder generation of the validation quizzes (SPEC-706 EF-2, ET-3 to ET-6, BR-NOT-07).
//
// A reminder is requested exactly 40 minutes before the planned quiz, computed with the profile
// zone and transmitted to `notify` as `eligibleAt`. The dedupe key contains the slot and its exact
// start: moving a slot changes the key, so the new reminder is distinct and the old unsent one is
// deleted (CA-2). A reminder whose instant already passed is never sent late (CL-5). Nothing here
// reimplements preferences, quiet hours or the daily cap: `notify` stays the only writer.
import { and, asc, eq, gte, like, lte, ne } from 'drizzle-orm';
import type { z } from 'zod';

import { NOTIFICATION_RULES } from '@learny/config';
import {
  NotificationProducerFacts,
  ValidationQuizReminderRequest,
  type ValidationQuizReminderSchedule,
} from '@learny/contracts';
import { AppError, parseTimeZone } from '@learny/core';
import { schema, type Db } from '@learny/db';

import { notify, type NotifySystemContext } from '../notify';

import {
  produceNotificationInput,
  validationQuizReminderAt,
  validationQuizReminderKey,
  validationQuizReminderSchedule,
} from './index';

const { modules, notificationDeliveries, notifications, profiles, scheduleSlots } = schema;

export type ReminderContext = NotifySystemContext;

export interface ReminderOutcome {
  schedule: ValidationQuizReminderSchedule;
  notificationId: string | null;
  created: boolean;
  /** CL-5 — the eligibility instant already passed: nothing is sent late. */
  expired: boolean;
  /** EF-2, CA-2 — old unsent reminders of the same slot removed by a move. */
  cancelled: number;
}

export interface ReminderSyncSummary {
  produced: number;
  created: number;
  cancelled: number;
  expired: number;
}

const REMINDER_BATCH_MAX = 200;

function parseInput<T>(schemaValue: z.ZodType<T>, value: unknown): T {
  const parsed = schemaValue.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Rappel invalide.', {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** ET-2 — the profile zone is the authority; the contract only accepts a valid IANA name. */
export async function profileTimezone(sdb: Db, userId: string): Promise<string> {
  const rows = await sdb
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = rows[0];
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return parseTimeZone(profile.timezone);
}

/** BR-NOT-06, EF-2 — a delivered reminder stays in the history; an unsent one is removed. */
async function deleteIfUnsent(sdb: Db, userId: string, notificationId: string): Promise<boolean> {
  const sent = await sdb
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.status, 'sent'),
      ),
    )
    .limit(1);
  if (sent.length > 0) return false;
  await sdb
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return true;
}

/** EF-2 — deletes the unsent reminders of the same slot, keeping the current key. */
async function cancelOtherReminders(
  sdb: Db,
  userId: string,
  slotId: string,
  currentKey: string,
): Promise<number> {
  const rows = await sdb
    .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'validation_soon'),
        like(notifications.dedupeKey, `validation_soon:${slotId}:%`),
        ne(notifications.dedupeKey, currentKey),
      ),
    );
  let cancelled = 0;
  for (const row of rows) {
    if (await deleteIfUnsent(sdb, userId, row.id)) cancelled += 1;
  }
  return cancelled;
}

/**
 * CL-2 — a stale producer never overwrites a move: when the planned slot no longer starts at the
 * requested instant, the current state is returned in a `CONFLICT` (HTTP 409).
 */
async function assertSlotVersion(
  sdb: Db,
  userId: string,
  slotId: string,
  startsAt: Date,
): Promise<void> {
  const rows = await sdb
    .select({ startsAt: scheduleSlots.startsAt })
    .from(scheduleSlots)
    .where(and(eq(scheduleSlots.id, slotId), eq(scheduleSlots.userId, userId)))
    .limit(1);
  const slot = rows[0];
  if (slot !== undefined && slot.startsAt.getTime() !== startsAt.getTime()) {
    throw new AppError('CONFLICT', 'Le créneau a été déplacé.', {
      errors: [{ path: 'startsAt', message: slot.startsAt.toISOString() }],
    });
  }
}

/**
 * EF-2, BR-NOT-07 — schedules the reminder of one slot. A request is idempotent through its
 * dedupe key; a future `eligibleAt` schedules the external deliveries instead of sending them.
 */
export async function scheduleValidationQuizReminder(
  sctx: ReminderContext,
  rawInput: unknown,
): Promise<ReminderOutcome> {
  const input = parseInput(ValidationQuizReminderRequest, rawInput);
  const timezone = await profileTimezone(sctx.sdb, input.userId);
  const startsAt = new Date(input.startsAt);
  await assertSlotVersion(sctx.sdb, input.userId, input.slotId, startsAt);

  const scheduleValue = validationQuizReminderSchedule(
    input.slotId,
    startsAt.toISOString(),
    timezone,
  );
  const schedule: ValidationQuizReminderSchedule = {
    slotId: input.slotId,
    startAt: startsAt.toISOString(),
    eligibleAt: scheduleValue.eligibleAt.toISOString(),
    localTime: scheduleValue.localTime,
    localDay: scheduleValue.localDay,
    dedupeKey: scheduleValue.dedupeKey,
  };

  if (scheduleValue.eligibleAt.getTime() <= sctx.clock.now().getTime()) {
    // CL-5 — do not send late; the previous reminder of this slot is still cleaned.
    const cancelled = await cancelOtherReminders(
      sctx.sdb,
      input.userId,
      input.slotId,
      scheduleValue.dedupeKey,
    );
    return { schedule, notificationId: null, created: false, expired: true, cancelled };
  }

  const facts = parseInput(NotificationProducerFacts, {
    kind: 'validation_quiz_reminder',
    userId: input.userId,
    ...(input.formationId === undefined || input.formationId === null
      ? {}
      : { formationId: input.formationId }),
    slotId: input.slotId,
    ...(input.moduleId === undefined || input.moduleId === null
      ? {}
      : { moduleId: input.moduleId }),
    ...(input.moduleTitle === undefined ? {} : { moduleTitle: input.moduleTitle }),
    startsAt: startsAt.toISOString(),
    timezone,
    ...(input.minutes === undefined ? {} : { minutes: input.minutes }),
  });
  const produced = produceNotificationInput(facts, sctx.clock.now());
  const result = await notify(sctx, produced.input);
  if (!result.ok) throw result.error;
  const cancelled = await cancelOtherReminders(
    sctx.sdb,
    input.userId,
    input.slotId,
    scheduleValue.dedupeKey,
  );
  return {
    schedule,
    notificationId: result.value.notificationId,
    created: result.value.created,
    expired: false,
    cancelled,
  };
}

/**
 * CA-2 — removes the reminders whose slot is no longer planned with the same start: a move,
 * a cancellation or a missed session invalidates the old dedupe key (ET-4).
 */
export async function pruneValidationQuizReminders(
  sctx: ReminderContext,
  userId: string,
): Promise<number> {
  const [activeSlots, reminderRows] = await Promise.all([
    sctx.sdb
      .select({ id: scheduleSlots.id, startsAt: scheduleSlots.startsAt })
      .from(scheduleSlots)
      .where(
        and(
          eq(scheduleSlots.userId, userId),
          eq(scheduleSlots.kind, 'validation_quiz'),
          eq(scheduleSlots.status, 'planned'),
        ),
      ),
    sctx.sdb
      .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, 'validation_soon'))),
  ]);
  const active = new Set(activeSlots.map((slot) => `${slot.id}:${slot.startsAt.toISOString()}`));
  let cancelled = 0;
  for (const reminder of reminderRows) {
    const key = reminder.dedupeKey ?? '';
    const match = /^validation_soon:([0-9a-f-]{36}):(.+)$/u.exec(key);
    if (match === null) continue;
    const signature = `${match[1] ?? ''}:${match[2] ?? ''}`;
    if (!active.has(signature) && (await deleteIfUnsent(sctx.sdb, userId, reminder.id))) {
      cancelled += 1;
    }
  }
  return cancelled;
}

/**
 * ET-6 — hourly generator of the reminders of the next hour. Each planned validation quiz whose
 * 40-minute instant falls in the hour gets exactly one notification, with `eligibleAt` set to that
 * instant; the move of a slot cancels the previous unsent reminder (CA-2).
 */
export async function syncValidationQuizReminders(
  sctx: ReminderContext,
  options: { batchSize?: number } = {},
): Promise<ReminderSyncSummary> {
  const db = sctx.sdb;
  const now = sctx.clock.now();
  const minutes = NOTIFICATION_RULES.validationQuizReminderMinutes;
  const from = new Date(now.getTime() + minutes * 60_000);
  const to = new Date(from.getTime() + 60 * 60_000);
  const batchSize = Math.min(options.batchSize ?? REMINDER_BATCH_MAX, REMINDER_BATCH_MAX);

  const upcoming = await db
    .select({
      id: scheduleSlots.id,
      userId: scheduleSlots.userId,
      formationId: scheduleSlots.formationId,
      moduleId: scheduleSlots.moduleId,
      title: scheduleSlots.title,
      moduleTitle: modules.title,
      startsAt: scheduleSlots.startsAt,
    })
    .from(scheduleSlots)
    .leftJoin(modules, eq(modules.id, scheduleSlots.moduleId))
    .where(
      and(
        eq(scheduleSlots.kind, 'validation_quiz'),
        eq(scheduleSlots.status, 'planned'),
        gte(scheduleSlots.startsAt, from),
        lte(scheduleSlots.startsAt, to),
      ),
    )
    .orderBy(asc(scheduleSlots.startsAt))
    .limit(batchSize);

  let produced = 0;
  let created = 0;
  let cancelled = 0;
  let expired = 0;
  const touched = new Set<string>();
  for (const slot of upcoming) {
    const outcome = await scheduleValidationQuizReminder(sctx, {
      userId: slot.userId,
      formationId: slot.formationId,
      slotId: slot.id,
      ...(slot.moduleId === null ? {} : { moduleId: slot.moduleId }),
      moduleTitle: slot.moduleTitle ?? slot.title,
      startsAt: slot.startsAt.toISOString(),
      timezone: await profileTimezone(db, slot.userId),
    });
    produced += 1;
    if (outcome.created) created += 1;
    if (outcome.expired) expired += 1;
    cancelled += outcome.cancelled;
    touched.add(slot.userId);
  }

  // A slot moved out of the window leaves an orphan reminder: clean the learners that still own
  // one, plus the learners just processed.
  const owners = await db
    .selectDistinct({ userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.type, 'validation_soon'))
    .limit(batchSize);
  for (const owner of owners) touched.add(owner.userId);
  for (const userId of touched) {
    cancelled += await pruneValidationQuizReminders(sctx, userId);
  }
  return { produced, created, cancelled, expired };
}

/** In-app only helper: the reminders of one learner, oldest first. */
export async function listValidationReminders(
  sctx: ReminderContext,
  userId: string,
): Promise<{ id: string; dedupeKey: string | null }[]> {
  return sctx.sdb
    .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'validation_soon')))
    .orderBy(asc(notifications.createdAt));
}

/** BR-NOT-07 — the reminder window of one hourly tick (ET-6). */
export function reminderWindow(now: Date): { from: Date; to: Date } {
  const minutes = NOTIFICATION_RULES.validationQuizReminderMinutes;
  const from = new Date(now.getTime() + minutes * 60_000);
  return { from, to: new Date(from.getTime() + 60 * 60_000) };
}

/** The stable key of a slot, exposed for the integration tests and the job (ET-4). */
export function reminderKeyOf(slotId: string, startsAt: Date | string): string {
  return validationQuizReminderKey(slotId, startsAt);
}

/** The reminder instant of a slot, exposed for the integration tests (CA-2). */
export function nextReminderInstant(startsAt: Date | string): Date {
  return validationQuizReminderAt(startsAt);
}
