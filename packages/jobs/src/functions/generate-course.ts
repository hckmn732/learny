import { userDb } from '@learny/db';
import { generateCourseForModule } from '@learny/tutor';

import { defineFunction } from '../define';
import { emitAfterCommit } from '../emit';

// SPEC-608 EF-1, EF-5, ET-2, ET-4 — durable generation job of one module.
//
// `chapter/contributions-completed` carries the deterministic generation version; the job runs the
// tutor pipeline with the learner's RLS store, writes one atomic version and emits `course/generated`
// and the "course ready" notification after commit. A replay of the same event id finds the version
// by its idempotency key and emits nothing (CL-2, CA-4). The existing question-bank function consumes
// `course/generated`, so the banks are requested in the same path.

export const GENERATE_COURSE_ID = 'generate-course';

export const generateCourseJob = defineFunction(
  {
    id: GENERATE_COURSE_ID,
    trigger: { event: 'chapter/contributions-completed' },
    retries: 3,
    concurrency: { key: 'event.data.moduleId', limit: 1 },
    timeouts: { finish: '10m' },
  },
  async ({ event, step, ctx }) => {
    const { userId, moduleId } = event.data;
    return step.run('generate-course', async () => {
      return generateCourseForModule({
        userId,
        requestId: ctx.requestId,
        store: userDb({ userId }),
        llmDb: ctx.sdb,
        clock: ctx.clock,
        logger: ctx.logger,
        moduleId,
        generationKey: event.id,
        events: {
          generated: async (data) => {
            await emitAfterCommit(
              ctx.sdb,
              'course/generated',
              data,
              { id: `course-generated:${data.courseId}` },
              { clock: ctx.clock, logger: ctx.logger },
            );
          },
          notificationRequested: async (data) => {
            await emitAfterCommit(
              ctx.sdb,
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
  },
);
