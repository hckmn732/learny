// Onboarding state and reminder effects (SPEC-602 ET-2, EF-9, EF-10).
//
// Every read and write goes through the learner's RLS client (`ctx.db`): another learner's rhythm,
// notifications or AI assignments never reach the screen. Rhythm and reminder defaults come from
// SPEC-102 (`@learny/config`), never from a copy in the page.
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AUTOMATION_DEFAULTS, NOTIFICATION_DEFAULTS, STUDY_DEFAULTS } from '@learny/config/product';
import { type MeDto, type ReminderChoices, type StudyPreferencesDto } from '@learny/contracts';
import type { Result } from '@learny/core';
import { schema, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { readMe } from '../me';
import { requireUser, toResult } from '../resources/result';

const { aiCredentials, aiTaskModels, automationSettings, notificationSettings, subscriptions } =
  schema;

/** Keys toggled by the « Automatismes recommandés » switch (EF-10). */
export const ONBOARDING_AUTOMATION_KEYS = [
  'reprise',
  'micro_seance',
  'echauffement',
  'plafond_quiz',
] as const;

export interface ReminderState {
  push: boolean;
  email: boolean;
  automations: boolean;
}

export interface OnboardingState {
  profile: MeDto;
  preferences: StudyPreferencesDto;
  reminders: ReminderState;
  /** EF-10 — a Checkout is required after Rappels. */
  needsCheckout: boolean;
}

interface PreferenceRow {
  hours_per_day: number;
  study_days: number[];
  preferred_slots: string[];
  [key: string]: unknown;
}

function defaultPreferences(): StudyPreferencesDto {
  return {
    hoursPerDay: STUDY_DEFAULTS.hoursPerDay,
    studyDays: [...STUDY_DEFAULTS.studyDays],
    preferredSlots: [...STUDY_DEFAULTS.preferredSlots],
  };
}

async function readPreferences(tx: DbTx, userId: string): Promise<StudyPreferencesDto> {
  const rows = await tx.execute<PreferenceRow>(sql`
    select hours_per_day, study_days, preferred_slots::text[] as preferred_slots
    from public.study_preferences
    where user_id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) return defaultPreferences();
  return {
    hoursPerDay: row.hours_per_day,
    studyDays: row.study_days,
    preferredSlots: row.preferred_slots as StudyPreferencesDto['preferredSlots'],
  };
}

async function readReminders(tx: DbTx, userId: string): Promise<ReminderState> {
  const [notification] = await tx
    .select({
      channelEmail: notificationSettings.channelEmail,
      channelPush: notificationSettings.channelPush,
    })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  const automationRows = await tx
    .select({ key: automationSettings.key, enabled: automationSettings.enabled })
    .from(automationSettings)
    .where(
      and(
        eq(automationSettings.userId, userId),
        inArray(automationSettings.key, [...ONBOARDING_AUTOMATION_KEYS]),
      ),
    );
  return {
    push: notification?.channelPush ?? NOTIFICATION_DEFAULTS.channelPush,
    email: notification?.channelEmail ?? NOTIFICATION_DEFAULTS.channelEmail,
    automations:
      automationRows.length === ONBOARDING_AUTOMATION_KEYS.length &&
      automationRows.every((row) => row.enabled),
  };
}

/** ET-2 — a qualified personal model assigned to the five tasks of the tutor. */
async function hasFiveQualifiedAssignments(tx: DbTx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ tasks: sql<number>`count(distinct ${aiTaskModels.task})::int` })
    .from(aiTaskModels)
    .innerJoin(
      aiCredentials,
      and(
        eq(aiCredentials.id, aiTaskModels.credentialId),
        eq(aiCredentials.userId, userId),
        eq(aiCredentials.status, 'qualified'),
      ),
    )
    .where(eq(aiTaskModels.userId, userId));
  return (row?.tasks ?? 0) >= 5;
}

async function subscriptionActive(tx: DbTx, userId: string, now: Date): Promise<boolean> {
  const [row] = await tx
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return (
    row?.status === 'active' &&
    row.currentPeriodEnd !== null &&
    row.currentPeriodEnd.getTime() > now.getTime()
  );
}

/** EF-10 — Checkout is needed when neither five assigned models nor the provided AI are ready. */
export function onboardingNeedsCheckout(ctx: ServiceContext): Promise<boolean> {
  const { userId, db } = requireUser(ctx);
  const now = ctx.clock.now();
  return db.run(async (tx) => {
    if (await hasFiveQualifiedAssignments(tx, userId)) return false;
    return !(await subscriptionActive(tx, userId, now));
  });
}

/** ET-2 — profile, rhythm, reminder switches and the Checkout decision in one read. */
export function getOnboardingState(ctx: ServiceContext): Promise<Result<OnboardingState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const profile = await readMe(tx, userId);
      const preferences = await readPreferences(tx, userId);
      const reminders = await readReminders(tx, userId);
      const ready = await hasFiveQualifiedAssignments(tx, userId);
      const active = ready ? true : await subscriptionActive(tx, userId, now);
      return { profile, preferences, reminders, needsCheckout: !ready && !active };
    });
  });
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** ET-2 — writes the three reminder switches, inside the caller's transaction. */
export async function applyReminderChoicesInTx(
  tx: DbTx,
  userId: string,
  reminders: ReminderChoices,
  now: Date,
): Promise<void> {
  await tx
    .insert(notificationSettings)
    .values({
      userId,
      channelPush: reminders.push,
      channelEmail: reminders.email,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: {
        channelPush: reminders.push,
        channelEmail: reminders.email,
        updatedAt: now,
      },
    });

  for (const key of ONBOARDING_AUTOMATION_KEYS) {
    const params = recordOf(AUTOMATION_DEFAULTS[key]);
    await tx
      .insert(automationSettings)
      .values({ userId, key, enabled: reminders.automations, params, updatedAt: now })
      .onConflictDoUpdate({
        target: [automationSettings.userId, automationSettings.key],
        set: { enabled: reminders.automations, updatedAt: now },
      });
  }
}

/** ET-2 — standalone form used by tests and by any caller outside `advanceOnboarding`. */
export function applyReminderChoices(
  ctx: ServiceContext,
  reminders: ReminderChoices,
): Promise<Result<void>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    await db.run((tx) => applyReminderChoicesInTx(tx, userId, reminders, now));
  });
}

/** The automation keys of the screen, as a set for callers that assert the untouched ones. */
export const ONBOARDING_AUTOMATION_KEYS_SET = new Set<string>(ONBOARDING_AUTOMATION_KEYS);
