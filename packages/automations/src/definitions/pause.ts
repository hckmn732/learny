// « Mode pause et retour » (SPEC-721, BR-AUT-10, ADR-0016, ADR-0190).
//
// The definition reacts to the nightly tick: an active pause whose inclusive end date is before
// the learner's local day ends itself once. The effect resumes the formations paused by the
// global pause (SPEC-618) and replans them through SPEC-407, or proposes the ten-minute
// diagnostic of SPEC-406 first. Manual starts and early resumes go through the `/me/pause`
// routes of the service; both paths share the same transactional helpers and the same journal
// entries, so a replay never duplicates a diagnostic or an effect.
import { z } from 'zod';

import { PauseParams } from '@learny/contracts';
import { AppError, ok, userLocalDay } from '@learny/core';
import { sql } from '@learny/db';
import { applyPauseAutomationInTx, pauseSummary } from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationTone,
} from '../moteur-d-automatismes';

interface PauseRow {
  id: string;
  starts_on: string;
  ends_on: string;
  diagnostic_on_return: boolean;
  status: string;
  [key: string]: unknown;
}

async function duePause(
  ctx: AutomationDomainContext<z.infer<typeof PauseParams>>,
): Promise<PauseRow | null> {
  const rows = await ctx.db.execute<PauseRow>(sql`
    select id::text as id,
           starts_on::text as starts_on,
           ends_on::text as ends_on,
           diagnostic_on_return,
           status::text as status
    from public.pauses
    where user_id = ${ctx.userId}::uuid
      and status = 'active'
    order by created_at desc
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) return null;
  const today = userLocalDay(ctx.now, ctx.timeZone);
  return today > row.ends_on ? row : null;
}

function endDateOf(action: AutomationActionView): string {
  const end = action.payload.endDate;
  return typeof end === 'string' ? end : '';
}

function diagnosticOf(action: AutomationActionView): boolean {
  return action.payload.diagnosticEnabled !== false;
}

/** EF-2 — one line, ≤ 160 characters, with the prefix of the final status. */
export function explainPause(action: AutomationActionView, tone: AutomationTone): string {
  const prefix =
    action.status === 'undone' ? 'Annulé : ' : action.status === 'declined' ? 'Refusé : ' : '';
  return `${prefix}${pauseSummary(action.kind, endDateOf(action), diagnosticOf(action), tone)}`;
}

export const pauseAutomation: AutomationDefinition<typeof PauseParams> = defineAutomation({
  key: 'pause',
  triggers: [{ type: 'nightly' }, { type: 'direct' }],
  params: PauseParams,
  run: async (ctx, trigger): Promise<readonly AutomationActionDraft[]> => {
    if (trigger.type !== 'nightly') return [];
    const row = await duePause(ctx);
    if (row === null) return [];
    return [
      {
        kind: 'pause_ended',
        formationId: null,
        requiresConsent: false,
        payload: {
          dedupeKey: `pause:end:${row.id}`,
          pauseId: row.id,
          endDate: row.ends_on,
          startsOn: row.starts_on,
          diagnosticEnabled: row.diagnostic_on_return,
          diagnosticMinutes: ctx.params.diagnosticMinutes,
          createdAt: ctx.now.toISOString(),
        },
        dedupeKey: `pause:end:${row.id}`,
      },
    ];
  },
  explain: (action, tone) => explainPause(action, tone),
  apply: async (ctx, action) => {
    if (action.kind === 'pause_started') {
      return ok({ payload: action.payload });
    }
    if (action.kind !== 'pause_ended') {
      throw new AppError('VALIDATION_FAILED', 'Type d’action de pause inconnu.');
    }
    const result = await applyPauseAutomationInTx(ctx.tx, {
      userId: ctx.userId,
      kind: action.kind,
      now: ctx.now,
      timeZone: ctx.timeZone,
      tone: ctx.tone,
      clock: ctx.clock,
      payload: action.payload,
    });
    return ok({
      payload: {
        ...action.payload,
        resumedFormationIds: result.resumedFormationIds,
        ...(result.diagnostic === null ? {} : { diagnostic: result.diagnostic }),
      },
      undoPayload: null,
    });
  },
  undo: () => Promise.resolve(ok(null)),
});
