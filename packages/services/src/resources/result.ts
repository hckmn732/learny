// Shared plumbing of the file service: Result wrapping and the authenticated caller.
import { AppError, err, ok, type Result } from '@learny/core';
import type { UserDatabase } from '@learny/db';

import type { ServiceContext } from '../context';

/**
 * Runs a flow that throws `AppError` for every business refusal and returns it as a `Result`
 * (docs/engineering/conventions.md §2). Anything that is not an `AppError` is a defect and is
 * rethrown for the API wrapper to report.
 */
export async function toResult<T>(flow: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await flow());
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

export function requireUser(ctx: ServiceContext): { userId: string; db: UserDatabase } {
  if (ctx.userId === null || ctx.db === null) {
    throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour effectuer cette action.');
  }
  return { userId: ctx.userId, db: ctx.db };
}
