// POST /api/v1/formations/:fid/resume (SPEC-618 EF-2, EF-3, ET-2 to ET-4; BR-FOR-10,
// BR-FOR-15, ADR-0016).
//
// The resume is one transaction: the optional formation chosen in the limit dialog is paused,
// the target becomes active and the planner recreates its future slots from the learner's local
// day. When the limit would be exceeded without an explicit choice, the answer is `limit` and
// nothing is written (EF-3).

import { randomUUID } from 'node:crypto';

import type { FormationResumeInput, FormationTransitionOutput } from '@learny/contracts';
import { AppError, userLocalDay, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { replanFormationAfterResume } from '../planning';
import { requireUser, toResult } from '../resources/result';

import { activeLimitDecision, transitionFor } from './active-limit';
import {
  assertUpdatedAt,
  cancelFutureSlots,
  fallbackCurrentFormation,
  lockFormationTransitions,
  readFormationForUpdate,
  readManagementState,
  readProfileForUpdate,
} from './state';

interface ActiveIdRow {
  id: string;
  [key: string]: unknown;
}

/** EF-3, ET-3 — persisted slots of the formation chosen in the dialog stay frozen. */
async function pauseChosenFormation(
  tx: Parameters<typeof readFormationForUpdate>[0],
  userId: string,
  formationId: string,
  now: Date,
): Promise<boolean> {
  const chosen = await readFormationForUpdate(tx, userId, formationId);
  const decision = transitionFor(chosen.status, 'pause');
  if (decision === null || decision.outcome === 'unchanged') return false;
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
  return true;
}

export function resumeFormation(
  ctx: ServiceContext,
  formationId: string,
  input: FormationResumeInput = {},
): Promise<Result<FormationTransitionOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const result = await db.run(async (tx) => {
      await lockFormationTransitions(tx, userId);
      const profile = await readProfileForUpdate(tx, userId);
      const formation = await readFormationForUpdate(tx, userId, formationId);
      const decision = transitionFor(formation.status, 'resume');
      if (decision === null) {
        throw new AppError('CONFLICT', 'Cette formation ne peut pas être reprise.', {
          status: 409,
        });
      }
      if (decision.outcome === 'unchanged') {
        return {
          outcome: 'unchanged' as const,
          state: await readManagementState(tx, userId),
          pausedFormationId: null,
          pausedAt: null,
          resumedOn: null,
        };
      }
      assertUpdatedAt(formation, input.expectedUpdatedAt);

      const activeRows = await tx.execute<ActiveIdRow>(sql`
        select f.id::text as id
        from public.formations f
        where f.owner_id = ${userId}::uuid
          and f.status = 'active'
          and f.id <> ${formationId}::uuid
      `);
      const limit = activeLimitDecision(activeRows.length, input.pauseFormationId);
      if (limit === 'requires-pause') {
        return {
          outcome: 'limit' as const,
          state: await readManagementState(tx, userId),
          pausedFormationId: null,
          pausedAt: null,
          resumedOn: null,
        };
      }

      let pausedFormationId: string | null = null;
      if (limit === 'allowed-with-pause') {
        const chosenId = input.pauseFormationId;
        if (chosenId === undefined) {
          throw new AppError('CONFLICT', 'Choisissez une formation à mettre en pause.', {
            status: 409,
          });
        }
        if (!activeRows.some((row) => row.id === chosenId)) {
          throw new AppError(
            'CONFLICT',
            'La formation choisie n’est plus active. Rechargez la liste et choisissez à nouveau.',
            { status: 409 },
          );
        }
        pausedFormationId = chosenId;
        await pauseChosenFormation(tx, userId, chosenId, now);
      }

      await tx.execute(sql`
        update public.formations
        set status = 'active',
            paused_at = null,
            updated_at = ${now.toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      await replanFormationAfterResume(tx, userId, formationId, now, ctx.clock);
      await tx.execute(sql`
        update public.profiles
        set current_formation_id = ${formationId}::uuid
        where id = ${userId}::uuid
          and current_formation_id is null
      `);
      return {
        outcome: 'applied' as const,
        state: await readManagementState(tx, userId),
        pausedFormationId,
        pausedAt: pausedFormationId === null ? null : now.toISOString(),
        resumedOn: userLocalDay(now, profile.timezone),
      };
    });

    if (result.pausedFormationId !== null && result.pausedAt !== null) {
      await emitAfterCommit(
        db,
        'formation/paused',
        {
          userId,
          formationId: result.pausedFormationId,
          pausedAt: result.pausedAt,
        },
        {
          id: `formation-paused:${result.pausedFormationId}:${result.pausedAt}:${randomUUID()}`,
        },
      );
    }
    if (result.resumedOn !== null) {
      await emitAfterCommit(
        db,
        'formation/resumed',
        { userId, formationId, resumedOn: result.resumedOn },
        { id: `formation-resumed:${formationId}:${randomUUID()}` },
      );
    }
    return {
      outcome: result.outcome,
      state: result.state,
      pausedFormationId: result.pausedFormationId,
    };
  });
}
