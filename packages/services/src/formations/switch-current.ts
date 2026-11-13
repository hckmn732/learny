// PATCH /api/v1/me/current-formation (SPEC-618 EF-1, ET-5; BR-FOR-11, ADR-0075).
//
// The current formation lives in `profiles.current_formation_id`, not in localStorage: it survives
// a reconnection and the shell reads it on the next navigation. Only an active formation can be
// selected; selecting a paused one requires the resume transition first.

import type { CurrentFormationUpdateInput, FormationManagementState } from '@learny/contracts';
import type { Result } from '@learny/core';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { lockFormationTransitions, readManagementState, selectCurrentInTx } from './state';

export function switchCurrentFormation(
  ctx: ServiceContext,
  input: CurrentFormationUpdateInput,
): Promise<Result<FormationManagementState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      await lockFormationTransitions(tx, userId);
      await selectCurrentInTx(tx, userId, input.formationId);
      return readManagementState(tx, userId);
    });
  });
}
