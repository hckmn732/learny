// POST /api/v1/formations/:fid/pause (SPEC-618 EF-2, ET-2 to ET-4; BR-FOR-15, ADR-0016).
//
// One transaction pauses the row, cancels every future planned slot (a started activity stays
// readable, CL-4) and moves the current formation to the last active one consulted (CL-5). The
// `formation/paused` event is emitted only after the commit; replaying the action is a no-op
// without a second event.

import { randomUUID } from 'node:crypto';

import type { FormationPauseInput, FormationTransitionOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { transitionFor } from './active-limit';
import {
  assertUpdatedAt,
  cancelFutureSlots,
  fallbackCurrentFormation,
  lockFormationTransitions,
  readFormationForUpdate,
  readManagementState,
} from './state';

export function pauseFormation(
  ctx: ServiceContext,
  formationId: string,
  input: FormationPauseInput = {},
): Promise<Result<FormationTransitionOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const result = await db.run(async (tx) => {
      await lockFormationTransitions(tx, userId);
      const formation = await readFormationForUpdate(tx, userId, formationId);
      const decision = transitionFor(formation.status, 'pause');
      if (decision === null) {
        throw new AppError('CONFLICT', 'Cette formation ne peut pas être mise en pause.', {
          status: 409,
        });
      }
      if (decision.outcome === 'unchanged') {
        return {
          outcome: 'unchanged' as const,
          pausedAt: null,
          state: await readManagementState(tx, userId),
        };
      }
      assertUpdatedAt(formation, input.expectedUpdatedAt);
      await tx.execute(sql`
        update public.formations
        set status = 'paused',
            paused_at = ${now.toISOString()}::timestamptz,
            updated_at = ${now.toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      await cancelFutureSlots(tx, userId, formationId, now);
      await fallbackCurrentFormation(tx, userId, formationId);
      return {
        outcome: 'applied' as const,
        pausedAt: now.toISOString(),
        state: await readManagementState(tx, userId),
      };
    });

    if (result.pausedAt !== null) {
      await emitAfterCommit(
        db,
        'formation/paused',
        { userId, formationId, pausedAt: result.pausedAt },
        { id: `formation-paused:${formationId}:${result.pausedAt}:${randomUUID()}` },
      );
    }
    return { outcome: result.outcome, state: result.state, pausedFormationId: null };
  });
}
