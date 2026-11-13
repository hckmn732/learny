import { ProgrammeGetQuery, type ProgrammeProposalStateDto } from '@learny/contracts';
import { type Result } from '@learny/core';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { readProgrammeState } from './state';

// GET /formations/:fid/programme (SPEC-605 ET-1, ET-5): current proposal, or the version named by
// `?version=` so an old proposal stays readable after an adjustment (EF-3).

export function getProgrammeState(
  ctx: ServiceContext,
  formationId: string,
  query: unknown = {},
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = ProgrammeGetQuery.parse(query);
    return db.run((tx) =>
      readProgrammeState(tx, userId, formationId, {
        ...(parsed.version === undefined ? {} : { version: parsed.version }),
      }),
    );
  });
}

/** Server page read: the same state, with the completion flag already checked once. */
export function getProgrammePageState(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readProgrammeState(tx, userId, formationId));
  });
}
