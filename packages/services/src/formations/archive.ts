// POST /api/v1/formations/:fid/archive (SPEC-618 EF-2, ET-2, ET-4; BR-FOR-15, ADR-0016).
//
// Archiving removes the formation from the active list while keeping every historical row
// (attempts, review logs, gaps, progress). Future planned slots are frozen like a pause so the
// planner never wakes an archived formation. The current formation falls back exactly as after a
// pause (CL-5).

import type { FormationPauseInput, FormationTransitionOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

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

export function archiveFormation(
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
      const decision = transitionFor(formation.status, 'archive');
      if (decision === null) {
        throw new AppError('CONFLICT', 'Cette formation ne peut pas être archivée.', {
          status: 409,
        });
      }
      if (decision.outcome === 'unchanged') {
        return {
          outcome: 'unchanged' as const,
          state: await readManagementState(tx, userId),
        };
      }
      assertUpdatedAt(formation, input.expectedUpdatedAt);
      await tx.execute(sql`
        update public.formations
        set status = 'archived',
            paused_at = null,
            updated_at = ${now.toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      await cancelFutureSlots(tx, userId, formationId, now);
      await fallbackCurrentFormation(tx, userId, formationId);
      return {
        outcome: 'applied' as const,
        state: await readManagementState(tx, userId),
      };
    });
    return { outcome: result.outcome, state: result.state, pausedFormationId: null };
  });
}
