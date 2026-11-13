import { AUTOMATION_DEFAULTS, AUTOMATION_OPTIONS } from '@learny/config/product';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

// Delay and remediation gate of a new validation attempt (SPEC-612 ET-5, EF-8, BR-QUI-06,
// ADR-0173, ADR-0247). The delay comes from automation 4 (`retryDelayHours`, 24 h by default);
// a disabled automation means an immediate retry and no automatic remediation. In `required` mode
// the failed attempt must also have its remediation completed. Everything is read from persisted
// rows: the client never receives an earlier instant than the stored one.

export interface RetrySettings {
  enabled: boolean;
  delayHours: number;
  mode: 'advised' | 'required';
}

export interface RetryGateState {
  allowed: boolean;
  availableAt: string | null;
  reason: 'delay' | 'remediation_required' | null;
}

export interface RetryAvailabilityInput {
  now: Date;
  /** Latest graded attempt of the module, null when none exists. */
  latest: { attemptId: string; passed: boolean; submittedAt: Date | string | null } | null;
  settings: RetrySettings;
  remediationCompleted: boolean;
  inProgress: boolean;
}

const HOUR_MS = 3_600_000;
const DELAYS: readonly number[] = AUTOMATION_OPTIONS.remediation.retryDelayHours;

/** Pure computation of the gate (unit-tested without a database). */
export function retryAvailability(input: RetryAvailabilityInput): RetryGateState {
  if (input.inProgress || input.latest === null || input.latest.passed) {
    return { allowed: true, availableAt: null, reason: null };
  }
  const submittedAt =
    input.latest.submittedAt === null ? input.now : new Date(input.latest.submittedAt);
  const delayHours = input.settings.enabled ? input.settings.delayHours : 0;
  const availableAt = new Date(submittedAt.getTime() + delayHours * HOUR_MS).toISOString();
  if (input.now.getTime() < Date.parse(availableAt)) {
    return { allowed: false, availableAt, reason: 'delay' };
  }
  if (input.settings.enabled && input.settings.mode === 'required' && !input.remediationCompleted) {
    return { allowed: false, availableAt, reason: 'remediation_required' };
  }
  return { allowed: true, availableAt, reason: null };
}

/** Reads automation 4 of one learner; a missing row uses the documented default (24 h, advised). */
export async function readRetrySettings(tx: DbTx, userId: string): Promise<RetrySettings> {
  const rows = await tx.execute<{ enabled: boolean; params: unknown }>(sql`
    select enabled, params
    from public.automation_settings
    where user_id = ${userId}::uuid and key = 'remediation'
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) {
    return {
      enabled: true,
      delayHours: AUTOMATION_DEFAULTS.remediation.retryDelayHours,
      mode: 'advised',
    };
  }
  const params =
    typeof row.params === 'object' && row.params !== null && !Array.isArray(row.params)
      ? (row.params as Record<string, unknown>)
      : {};
  const rawDelay = params.retryDelayHours ?? params.delayHours;
  const delayHours =
    typeof rawDelay === 'number' && DELAYS.includes(rawDelay)
      ? rawDelay
      : AUTOMATION_DEFAULTS.remediation.retryDelayHours;
  const mode = params.mode === 'required' ? 'required' : 'advised';
  return { enabled: row.enabled, delayHours, mode };
}

interface GateRow extends Record<string, unknown> {
  attempt_id: string;
  passed: boolean;
  submitted_at: Date | string | null;
}

interface RemediationRow extends Record<string, unknown> {
  id: string;
}

export async function readRetryGate(
  tx: DbTx,
  userId: string,
  moduleId: string,
  now: Date,
): Promise<RetryGateState> {
  const inProgress = await tx.execute<{ id: string }>(sql`
    select at.id::text as id
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
      and at.status = 'in_progress'
    limit 1
  `);
  const graded = await tx.execute<GateRow>(sql`
    select at.id::text as attempt_id, at.passed, at.submitted_at
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
      and at.status = 'graded'
    order by at.attempt_no desc, at.created_at desc
    limit 1
  `);
  const latest = graded[0];
  const settings = await readRetrySettings(tx, userId);
  let remediationCompleted = false;
  if (latest !== undefined && !latest.passed) {
    const completed = await tx.execute<RemediationRow>(sql`
      select act.id::text as id
      from public.activities act
      join public.attempts at on at.activity_id = act.id and at.user_id = ${userId}::uuid
      where act.owner_id = ${userId}::uuid
        and act.module_id = ${moduleId}::uuid
        and act.kind = 'remediation'
        and (act.config ->> 'sourceAttemptId') = ${latest.attempt_id}
        and at.status = 'graded'
      limit 1
    `);
    remediationCompleted = completed.length > 0;
  }
  return retryAvailability({
    now,
    latest:
      latest === undefined
        ? null
        : {
            attemptId: latest.attempt_id,
            passed: latest.passed,
            submittedAt: latest.submitted_at,
          },
    settings,
    remediationCompleted,
    inProgress: inProgress.length > 0,
  });
}

/** ET-5 — public read used by the result screen and by the guard. */
export function retryGate(
  ctx: ServiceContext,
  moduleIdValue: string,
): Promise<Result<RetryGateState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readRetryGate(tx, userId, moduleIdValue, ctx.clock.now()));
  });
}

/** EF-8 — 422 with `availableAt` and `reason`, added to the SPEC-611 guard registry. */
export const retryDelayGuard = async (
  ctx: ServiceContext,
  moduleId: string,
): Promise<Result<void>> => {
  const gate = await retryGate(ctx, moduleId);
  if (!gate.ok) return gate;
  if (gate.value.allowed) return { ok: true, value: undefined };
  const detail =
    gate.value.reason === 'remediation_required'
      ? 'Terminez d’abord la remédiation ciblée de ce module.'
      : 'La nouvelle tentative n’est pas encore disponible.';
  return {
    ok: false,
    error: new AppError('RETRY_NOT_YET_ALLOWED', detail, {
      status: 422,
      reason: gate.value.reason ?? 'delay',
      ...(gate.value.availableAt === null ? {} : { availableAt: gate.value.availableAt }),
    }),
  };
};
