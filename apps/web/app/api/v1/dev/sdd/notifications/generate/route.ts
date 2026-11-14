import { devNotificationsGenerate } from '@learny/contracts';
import { AppError } from '@learny/core';
import { generateNotificationDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-706 (EF-8): the thirteen producers and an optional validation quiz
// reminder for the signed-in learner. The dedupe keys make a replay write nothing new.
export const POST = devOnly(
  handler(devNotificationsGenerate, ({ ctx, body }) => {
    if (ctx.userId === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Vous devez être connecté pour effectuer cette action.',
      );
    }
    return generateNotificationDemo(ctx, body);
  }),
);
