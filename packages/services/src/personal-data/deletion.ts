// Account deletion request and cancellation (SPEC-211 EF-5, EF-6, ET-6, CL-7; BR-ACC-11).
//
// Scheduling is idempotent: a second call returns the same deadline and sends no second e-mail.
// The session stays valid and the post-authentication destination of SPEC-202 sends the learner to
// `/parametres#profil`, where the cancellation is offered. The effective deletion belongs to the
// nightly job (`account-deletion`), never to the HTTP request.
import { sql } from 'drizzle-orm';

import { AppError, formatUserDate, type Result } from '@learny/core';
import { serviceDb } from '@learny/db';
import { sendEmail } from '@learny/notifications/email';

import type { ServiceContext, SystemContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { formatLongDate } from './zip-layout';

export const DELETION_DELAY_DAYS = 30;
export const DELETION_DELAY_MS = DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000;

interface ProfileDeletionRow {
  id: string;
  email: string;
  timezone: string;
  deletionRequestedAt: Date | null;
  deletionScheduledFor: Date | null;
}

function instant(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function profileForDeletion(userId: string): Promise<ProfileDeletionRow> {
  const rows = await serviceDb().execute<{
    id: string;
    email: string;
    timezone: string;
    deletion_requested_at: Date | string | null;
    deletion_scheduled_for: Date | string | null;
  }>(sql`
    select id::text as id, email, timezone, deletion_requested_at, deletion_scheduled_for
    from public.profiles where id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone,
    deletionRequestedAt: instant(row.deletion_requested_at),
    deletionScheduledFor: instant(row.deletion_scheduled_for),
  };
}

/** EF-5 — schedules the deletion at J+30; a replay returns the same deadline, without e-mail. */
export async function scheduleDeletion(
  ctx: ServiceContext,
): Promise<Result<{ scheduledFor: string }>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const profile = await profileForDeletion(userId);
    const now = ctx.clock.now();
    if (profile.deletionScheduledFor !== null) {
      return { scheduledFor: profile.deletionScheduledFor.toISOString() };
    }
    const scheduledFor = new Date(now.getTime() + DELETION_DELAY_MS);
    await serviceDb().transaction(async (tx) => {
      await tx.execute(sql`
        update public.profiles
        set deletion_requested_at = ${now.toISOString()}::timestamptz,
            deletion_scheduled_for = ${scheduledFor.toISOString()}::timestamptz,
            updated_at = ${now.toISOString()}::timestamptz
        where id = ${userId}::uuid and deletion_scheduled_for is null
      `);
    });
    const sent = await sendEmail(
      { sdb: serviceDb(), clock: ctx.clock, logger: ctx.logger },
      {
        userId,
        template: 'deletion_scheduled',
        props: { scheduledLabel: formatLongDate(scheduledFor, profile.timezone) },
        idempotencyKey: `deletion-scheduled:${userId}:${scheduledFor.toISOString()}`,
      },
    );
    if (!sent.ok) throw sent.error;
    return { scheduledFor: scheduledFor.toISOString() };
  });
}

/** EF-6 — clears both columns; without a pending request it still answers 204. */
export async function cancelDeletion(ctx: ServiceContext): Promise<Result<undefined>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    await serviceDb().execute(sql`
      update public.profiles
      set deletion_requested_at = null,
          deletion_scheduled_for = null,
          updated_at = ${ctx.clock.now().toISOString()}::timestamptz
      where id = ${userId}::uuid
    `);
    return undefined;
  });
}

/** Demonstration helper: local label of the deadline, with the profile's zone. */
export function deletionLabel(scheduledFor: Date, timezone: string): string {
  return formatUserDate(scheduledFor, timezone);
}

/** Ensures the system context never accidentally schedules for another user. */
export function assertSystemUser(ctx: SystemContext, userId: string): void {
  if (ctx.userId !== null && ctx.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Compte incohérent.');
  }
}
