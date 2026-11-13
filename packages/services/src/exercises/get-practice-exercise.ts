// Read model of one practice exercise for SCR-08 (SPEC-613 ET-1, ET-5; BR-PRA-01).
import { z } from 'zod';

import { AppError, type Result } from '@learny/core';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import {
  practiceExerciseDto,
  readExercise,
  readLatestAttempt,
  readNotionState,
} from './exercise-store';

export interface GetPracticeExerciseInput {
  formationId: string;
  moduleId: string;
  exerciseId: string;
}

/**
 * Reads the exercise, the revealed hints and the latest attempt under the learner's RLS client.
 * The formation and module in the URL must match the stored activity: a valid exercise of the
 * same learner under another module is a 404, never a content leak.
 */
export async function getPracticeExercise(
  ctx: ServiceContext,
  input: GetPracticeExerciseInput,
): Promise<Result<ReturnType<typeof practiceExerciseDto>>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (
      !z.uuid().safeParse(input.formationId).success ||
      !z.uuid().safeParse(input.moduleId).success ||
      !z.uuid().safeParse(input.exerciseId).success
    ) {
      throw new AppError('VALIDATION_FAILED', 'Identifiants invalides.');
    }
    return db.run(async (tx) => {
      const row = await readExercise(tx, userId, input.exerciseId);
      if (row.formation_id !== input.formationId || row.module_id !== input.moduleId) {
        throw new AppError('NOT_FOUND', 'Exercice introuvable.');
      }
      const [state, attempt] = await Promise.all([
        readNotionState(tx, userId, row.notion_id),
        readLatestAttempt(tx, userId, input.exerciseId),
      ]);
      return practiceExerciseDto(row, state, attempt);
    });
  });
}
