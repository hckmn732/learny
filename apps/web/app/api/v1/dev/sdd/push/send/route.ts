import { devPushSend } from '@learny/contracts';
import { AppError } from '@learny/core';
import { sendDemoPush } from '@learny/notifications/push';
import { createSystemContext } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';
import { pushDeps } from '../../../../../../../lib/api/push-deps';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-205 (EF-7): one in-app notification of the caller, sent through
// the configured push transport (mock in test and local) to the caller's own subscriptions.
export const POST = devOnly(
  handler(devPushSend, ({ ctx }) => {
    if (ctx.userId === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Vous devez être connecté pour effectuer cette action.',
      );
    }
    const system = createSystemContext({
      requestId: ctx.requestId,
      logger: ctx.logger,
      clock: ctx.clock,
    });
    return sendDemoPush(system, { userId: ctx.userId }, pushDeps());
  }),
);
