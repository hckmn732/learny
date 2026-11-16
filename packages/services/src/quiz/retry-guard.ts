import { formatUserDate, type Result } from '@learny/core';
import { AppError } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser } from '../resources/result';

import { retryGate } from './retry-gate';

// ET-3, EF-5 — guard of a new validation attempt (SPEC-715). It reads the latest applied
// `remediation_ready` action of the module through the RLS client of the learner, so a foreign
// attempt never blocks another learner. The date of the detail is rendered in the profile zone.

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

async function profileTimeZone(ctx: ServiceContext): Promise<string> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<{ timezone: string }>(sql`
      select timezone from public.profiles where id = ${userId}::uuid limit 1
    `),
  );
  return rows[0]?.timezone ?? 'Europe/Paris';
}

/** ET-3, EF-5 — `ok` when the next attempt is allowed, a 422 `RETRY_NOT_YET_ALLOWED` otherwise. */
export async function checkRetryAllowed(
  ctx: ServiceContext,
  moduleId: string,
): Promise<Result<void>> {
  const gate = await retryGate(ctx, moduleId);
  if (!gate.ok) return gate;
  if (gate.value.allowed) return { ok: true, value: undefined };
  const remediationRequired = gate.value.remediationRequired;
  let detail = 'Terminez d’abord la remédiation ciblée.';
  if (!remediationRequired && gate.value.availableAt !== null) {
    const timeZone = await profileTimeZone(ctx);
    const label = formatUserDate(gate.value.availableAt, timeZone, DATE_OPTIONS);
    detail = `Nouvelle tentative possible ${label}.`;
  }
  return {
    ok: false,
    error: new AppError('RETRY_NOT_YET_ALLOWED', detail, {
      status: 422,
      reason: gate.value.reason ?? (remediationRequired ? 'remediation_required' : 'delay'),
      ...(gate.value.availableAt === null ? {} : { availableAt: gate.value.availableAt }),
      remediationRequired,
    }),
  };
}
