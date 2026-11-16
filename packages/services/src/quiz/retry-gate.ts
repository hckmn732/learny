import { AUTOMATION_DEFAULTS, AUTOMATION_OPTIONS } from '@learny/config/product';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

// Delay and remediation gate of a new validation attempt (SPEC-612 ET-5, EF-8, SPEC-715 EF-5,
// ET-3, ET-4, BR-QUI-06, BR-AUT-04, ADR-0173, ADR-0190, ADR-0247). The authoritative values come
// from the latest applied `remediation_ready` action of the module, whose payload freezes the
// delay and mode of the failed attempt (SPEC-715 CL-11). When no action exists (automation
// disabled or data written before SPEC-715), the settings row and the latest failed attempt keep
// the documented fallback of SPEC-612. Everything is read from persisted rows.

export interface RetrySettings {
  enabled: boolean;
  delayHours: number;
  mode: 'advised' | 'required' | 'mandatory';
}

export interface RetryGateState {
  allowed: boolean;
  availableAt: string | null;
  reason: 'delay' | 'remediation_required' | null;
  remediationRequired: boolean;
  remediationDone: boolean;
}

export interface RetryAvailabilityInput {
  now: Date;
  /** Latest graded attempt of the module, null when none exists. */
  latest: { attemptId: string; passed: boolean; submittedAt: Date | string | null } | null;
  settings: RetrySettings;
  remediationCompleted: boolean;
  inProgress: boolean;
}

export interface RetryActionSnapshot {
  status: 'pending_consent' | 'applied' | 'declined' | 'undone' | 'expired' | 'consumed';
  retryAvailableAt: string | null;
  mode: 'advised' | 'mandatory';
  remediationActivityId: string | null;
  remediationDone: boolean;
}

const HOUR_MS = 3_600_000;
const DELAYS: readonly number[] = AUTOMATION_OPTIONS.remediation.retryDelayHours;

export function isMandatoryMode(mode: RetrySettings['mode']): boolean {
  return mode === 'mandatory' || mode === 'required';
}

/** Pure computation of the fallback gate (unit-tested without a database). */
export function retryAvailability(input: RetryAvailabilityInput): RetryGateState {
  if (input.inProgress || input.latest === null || input.latest.passed) {
    return {
      allowed: true,
      availableAt: null,
      reason: null,
      remediationRequired: false,
      remediationDone: input.remediationCompleted,
    };
  }
  const submittedAt =
    input.latest.submittedAt === null ? input.now : new Date(input.latest.submittedAt);
  const delayHours = input.settings.enabled ? input.settings.delayHours : 0;
  const availableAt = new Date(submittedAt.getTime() + delayHours * HOUR_MS).toISOString();
  const mandatory =
    input.settings.enabled && isMandatoryMode(input.settings.mode) && !input.remediationCompleted;
  if (input.now.getTime() < Date.parse(availableAt)) {
    return {
      allowed: false,
      availableAt,
      reason: 'delay',
      remediationRequired: mandatory,
      remediationDone: input.remediationCompleted,
    };
  }
  if (mandatory) {
    return {
      allowed: false,
      availableAt,
      reason: 'remediation_required',
      remediationRequired: true,
      remediationDone: false,
    };
  }
  return {
    allowed: true,
    availableAt,
    reason: null,
    remediationRequired: false,
    remediationDone: input.remediationCompleted,
  };
}

/** Pure gate computed from the frozen payload of a `remediation_ready` action. */
export function retryAvailabilityFromAction(input: {
  now: Date;
  action: RetryActionSnapshot;
}): RetryGateState {
  const action = input.action;
  if (action.status === 'undone' || action.status === 'consumed') {
    return {
      allowed: true,
      availableAt: null,
      reason: null,
      remediationRequired: false,
      remediationDone: action.remediationDone,
    };
  }
  if (action.status !== 'applied') {
    return {
      allowed: true,
      availableAt: null,
      reason: null,
      remediationRequired: false,
      remediationDone: action.remediationDone,
    };
  }
  const availableAt =
    action.retryAvailableAt === null || Number.isNaN(Date.parse(action.retryAvailableAt))
      ? null
      : new Date(action.retryAvailableAt).toISOString();
  const mandatory =
    action.mode === 'mandatory' && action.remediationActivityId !== null && !action.remediationDone;
  if (availableAt !== null && input.now.getTime() < Date.parse(availableAt)) {
    return {
      allowed: false,
      availableAt,
      reason: 'delay',
      remediationRequired: mandatory,
      remediationDone: action.remediationDone,
    };
  }
  if (mandatory) {
    return {
      allowed: false,
      availableAt,
      reason: 'remediation_required',
      remediationRequired: true,
      remediationDone: false,
    };
  }
  return {
    allowed: true,
    availableAt,
    reason: null,
    remediationRequired: false,
    remediationDone: action.remediationDone,
  };
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
  const rawDelay = params.delayHours ?? params.retryDelayHours;
  const delayHours =
    typeof rawDelay === 'number' && DELAYS.includes(rawDelay)
      ? rawDelay
      : AUTOMATION_DEFAULTS.remediation.retryDelayHours;
  const mode = params.mode === 'mandatory' || params.mode === 'required' ? 'mandatory' : 'advised';
  return { enabled: row.enabled, delayHours, mode };
}

interface GateRow extends Record<string, unknown> {
  attempt_id: string;
  passed: boolean;
  submitted_at: Date | string | null;
}

interface ActionRow extends Record<string, unknown> {
  status: RetryActionSnapshot['status'];
  payload: Record<string, unknown>;
}

interface RemediationRow extends Record<string, unknown> {
  id: string;
}

async function remediationDoneFor(
  tx: DbTx,
  userId: string,
  moduleId: string,
  sourceAttemptId: string,
): Promise<boolean> {
  const completed = await tx.execute<RemediationRow>(sql`
    select act.id::text as id
    from public.activities act
    join public.attempts at on at.activity_id = act.id and at.user_id = ${userId}::uuid
    where act.owner_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'remediation'
      and (act.config ->> 'sourceAttemptId') = ${sourceAttemptId}
      and at.status = 'graded'
    limit 1
  `);
  return completed.length > 0;
}

function actionSnapshot(
  payload: Record<string, unknown>,
  status: ActionRow['status'],
): RetryActionSnapshot {
  const retryAvailableAt =
    typeof payload.retryAvailableAt === 'string' ? payload.retryAvailableAt : null;
  const remediationActivityId =
    typeof payload.remediationActivityId === 'string' ? payload.remediationActivityId : null;
  return {
    status,
    retryAvailableAt,
    mode: payload.mode === 'mandatory' ? 'mandatory' : 'advised',
    remediationActivityId,
    remediationDone: false,
  };
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
  if (inProgress.length > 0) {
    return {
      allowed: true,
      availableAt: null,
      reason: null,
      remediationRequired: false,
      remediationDone: false,
    };
  }
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
  if (latest === undefined || latest.passed) {
    return {
      allowed: true,
      availableAt: null,
      reason: null,
      remediationRequired: false,
      remediationDone: false,
    };
  }

  const actions = await tx.execute<ActionRow>(sql`
    select status::text as status, payload
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'remediation'
      and (payload ->> 'moduleId') = ${moduleId}
      and (payload ->> 'attemptId') = ${latest.attempt_id}
    order by created_at desc, id desc
    limit 1
  `);
  const action = actions[0];
  if (action !== undefined) {
    const snapshot = actionSnapshot(action.payload, action.status);
    if (action.status === 'applied') {
      snapshot.remediationDone = await remediationDoneFor(tx, userId, moduleId, latest.attempt_id);
    }
    return retryAvailabilityFromAction({ now, action: snapshot });
  }

  const settings = await readRetrySettings(tx, userId);
  const remediationCompleted = await remediationDoneFor(tx, userId, moduleId, latest.attempt_id);
  return retryAvailability({
    now,
    latest: {
      attemptId: latest.attempt_id,
      passed: latest.passed,
      submittedAt: latest.submitted_at,
    },
    settings,
    remediationCompleted,
    inProgress: false,
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

/** EF-8 — 422 with `availableAt`, `reason` and `remediationRequired` (SPEC-611 registry). */
export const retryDelayGuard = async (
  ctx: ServiceContext,
  moduleId: string,
): Promise<Result<void>> => {
  const gate = await retryGate(ctx, moduleId);
  if (!gate.ok) return gate;
  if (gate.value.allowed) return { ok: true, value: undefined };
  const detail = gate.value.remediationRequired
    ? 'Terminez d’abord la remédiation ciblée.'
    : 'La nouvelle tentative n’est pas encore disponible.';
  return {
    ok: false,
    error: new AppError('RETRY_NOT_YET_ALLOWED', detail, {
      status: 422,
      reason: gate.value.reason ?? 'delay',
      ...(gate.value.availableAt === null ? {} : { availableAt: gate.value.availableAt }),
      remediationRequired: gate.value.remediationRequired,
    }),
  };
};
