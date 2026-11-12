import { devNotify } from '@learny/contracts';
import { AppError } from '@learny/core';
import { runNotifyDemo } from '@learny/services';

import { devOnly } from '../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-209 (EF-8): simulated settings, tone and clock, then the real
// `notify` service of the signed-in learner.
export const POST = devOnly(
  handler(devNotify, ({ ctx, body }) => {
    if (ctx.userId === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Vous devez être connecté pour effectuer cette action.',
      );
    }
    return runNotifyDemo(ctx, body);
  }),
);
