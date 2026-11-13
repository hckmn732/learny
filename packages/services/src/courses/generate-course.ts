import { z } from 'zod';

import { Uuid } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import { generateCourseForModule, type CourseGenerationResult } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { courseGeneratedEventId } from './version-course';

// SPEC-608 ET-2, ET-4 — service seam of the course generation. The model call and the version write
// run through the tutor pipeline; this wrapper supplies the learner's RLS store, the explicitly
// authorized client used only for model resolution, and the events emitted after commit.

export const GenerateCourseInput = z
  .strictObject({
    moduleId: Uuid,
    /** Deterministic identifier of the request (`course-generation:<module>:…`). */
    generationKey: z.string().trim().min(1).max(200),
  })
  .describe('Demande de génération du cours d’un module.');
export type GenerateCourseInput = z.infer<typeof GenerateCourseInput>;

export interface GenerateCourseOptions {
  deps?: {
    scenario?: string;
    scenarioForChapter?: (chapterId: string) => string | undefined;
  };
}

export function generateCourse(
  ctx: ServiceContext,
  input: unknown,
  options: GenerateCourseOptions = {},
): Promise<Result<CourseGenerationResult>> {
  return toResult(async () => {
    const checked = GenerateCourseInput.safeParse(input);
    if (!checked.success) {
      throw new AppError('VALIDATION_FAILED', 'La demande de génération est invalide.', {
        errors: checked.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || '(racine)',
          message: issue.message,
        })),
      });
    }
    const parsed = checked.data;
    const { userId, db } = requireUser(ctx);
    return generateCourseForModule({
      userId,
      requestId: ctx.requestId,
      store: db,
      llmDb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
      moduleId: parsed.moduleId,
      generationKey: parsed.generationKey,
      ...(options.deps === undefined ? {} : { deps: options.deps }),
      events: {
        generated: async (data) => {
          await emitAfterCommit(
            db,
            'course/generated',
            data,
            { id: courseGeneratedEventId(data.courseId) },
            { clock: ctx.clock, logger: ctx.logger },
          );
        },
        notificationRequested: async (data) => {
          await emitAfterCommit(
            db,
            'notification/requested',
            {
              userId: data.userId,
              type: data.type,
              data: data.data,
              formationId: data.formationId,
              dedupeKey: data.dedupeKey,
            },
            { id: `notification-requested:${data.dedupeKey}` },
            { clock: ctx.clock, logger: ctx.logger },
          );
        },
      },
    });
  });
}
