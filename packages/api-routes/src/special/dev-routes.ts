import {
  devEmailOutbox,
  devEmailOutboxPurge,
  devEventsDemoRun,
  devEventsDemoStart,
  devNotificationsGenerate,
  devStripeCheckoutCancel,
  devStripeCheckoutPay,
  devStripeSimulate,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  generateNotificationDemo,
  getDemoRun,
  listDemoOutbox,
  purgeDemoOutbox,
  startDemoPipeline,
} from '@learny/services';
import { cancelMockCheckout, payMockCheckout, simulateStripeAction } from '@learny/services/billing';

import { devRoute } from './dev';
import type { SpecialHandler } from './types';

// SPEC-1004 EF-2/CL-5 - bodies of the `dev.*` routes kept as e2e harness (ADR-2041); the
// development guard is applied by `devRoute`.
export const DEV_ROUTE_ENTRIES = {
  devEmailOutbox: devRoute(devEmailOutbox, (_args: HandlerArgs<typeof devEmailOutbox>) =>
    Promise.resolve(listDemoOutbox()),
  ),
  devEmailOutboxPurge: devRoute(
    devEmailOutboxPurge,
    (_args: HandlerArgs<typeof devEmailOutboxPurge>) => Promise.resolve(purgeDemoOutbox()),
  ),
  devEventsDemoRun: devRoute(
    devEventsDemoRun,
    ({ ctx, params }: HandlerArgs<typeof devEventsDemoRun>) => getDemoRun(ctx, params.runId),
  ),
  devEventsDemoStart: devRoute(
    devEventsDemoStart,
    ({ ctx, body }: HandlerArgs<typeof devEventsDemoStart>) => startDemoPipeline(ctx, body),
  ),
  devNotificationsGenerate: devRoute(
    devNotificationsGenerate,
    ({ ctx, body }: HandlerArgs<typeof devNotificationsGenerate>) => {
      if (ctx.userId === null) {
        throw new AppError(
          'UNAUTHENTICATED',
          'Vous devez être connecté pour effectuer cette action.',
        );
      }
      return generateNotificationDemo(ctx, body);
    },
  ),
  devStripeCheckoutCancel: devRoute(
    devStripeCheckoutCancel,
    ({ ctx, body }: HandlerArgs<typeof devStripeCheckoutCancel>) =>
      cancelMockCheckout(ctx, body.sessionId),
  ),
  devStripeCheckoutPay: devRoute(
    devStripeCheckoutPay,
    async ({ ctx, body }: HandlerArgs<typeof devStripeCheckoutPay>) => {
      const { redirectTo } = await payMockCheckout(ctx, body.sessionId);
      return { redirectTo };
    },
  ),
  devStripeSimulate: devRoute(
    devStripeSimulate,
    ({ ctx, body }: HandlerArgs<typeof devStripeSimulate>) =>
      simulateStripeAction(ctx, body.action),
  ),
} satisfies Record<string, SpecialHandler>;
