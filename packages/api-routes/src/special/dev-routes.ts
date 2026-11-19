import {
  devCronHourlyTick,
  devEcho as devEchoRoute,
  devEmailOutbox,
  devEmailOutboxPurge,
  devEmailPreview,
  devEmailSend,
  devEventsDemoRun,
  devEventsDemoStart,
  devEventsOutbox,
  devItems as devItemsRoute,
  devNotificationsGenerate,
  devNotify,
  devPersonalDataDeletion,
  devPersonalDataDeletionCancel,
  devPersonalDataExecute,
  devPersonalDataExport,
  devPushSend,
  devRateLimitBurst,
  devRateLimitOrigin,
  devRateLimitPurge,
  devStripeCheckoutCancel,
  devStripeCheckoutPay,
  devStripeEvents,
  devStripeSimulate,
  devUploadSimulation,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import type { HandlerArgs } from '@learny/http/route-handler';
import { sendDemoPush } from '@learny/notifications/push';
import {
  cancelDeletionDemo,
  createSystemContext,
  devEcho,
  generateNotificationDemo,
  getDemoRun,
  getOutboxCounts,
  listDemoOutbox,
  listDevItems,
  previewEmail,
  previewHourlyTick,
  purgeDemoOutbox,
  runBurst,
  runDeletionDemo,
  runExecutionDemo,
  runExportDemo,
  runNotifyDemo,
  runOriginDemo,
  runPurgeDemo,
  sendDemoEmail,
  simulateUpload,
  startDemoPipeline,
} from '@learny/services';
import {
  cancelMockCheckout,
  listStripeEvents,
  payMockCheckout,
  simulateStripeAction,
} from '@learny/services/billing';

import { pushDeps } from '../deps/push-deps';

import { devRoute } from './dev';
import type { SpecialHandler } from './types';
import { htmlResponse, wantsJson } from './unsubscribe-page';

// SPEC-1004 EF-2/CL-5 - bodies of the demonstration routes (`dev.*`), copied from the former route
// files; the development guard is applied by `devRoute`.
export const DEV_ROUTE_ENTRIES = {
  devCronHourlyTick: devRoute(
    devCronHourlyTick,
    ({ ctx, body }: HandlerArgs<typeof devCronHourlyTick>) => previewHourlyTick(ctx, body),
  ),
  devEcho: devRoute(devEchoRoute, ({ ctx, body }: HandlerArgs<typeof devEchoRoute>) =>
    Promise.resolve(devEcho(ctx, body)),
  ),
  devEmailOutbox: devRoute(devEmailOutbox, (_args: HandlerArgs<typeof devEmailOutbox>) =>
    Promise.resolve(listDemoOutbox()),
  ),
  devEmailOutboxPurge: devRoute(
    devEmailOutboxPurge,
    (_args: HandlerArgs<typeof devEmailOutboxPurge>) => Promise.resolve(purgeDemoOutbox()),
  ),
  devEmailPreview: devRoute(
    devEmailPreview,
    async ({ ctx, query, request }: HandlerArgs<typeof devEmailPreview>) => {
      const preview = await previewEmail(ctx, query);
      return wantsJson(request) ? preview : htmlResponse(preview.html, 200);
    },
  ),
  devEmailSend: devRoute(devEmailSend, ({ ctx, body }: HandlerArgs<typeof devEmailSend>) =>
    sendDemoEmail(ctx, body),
  ),
  devEventsDemoRun: devRoute(
    devEventsDemoRun,
    ({ ctx, params }: HandlerArgs<typeof devEventsDemoRun>) => getDemoRun(ctx, params.runId),
  ),
  devEventsDemoStart: devRoute(
    devEventsDemoStart,
    ({ ctx, body }: HandlerArgs<typeof devEventsDemoStart>) => startDemoPipeline(ctx, body),
  ),
  devEventsOutbox: devRoute(devEventsOutbox, ({ ctx }: HandlerArgs<typeof devEventsOutbox>) =>
    getOutboxCounts(ctx),
  ),
  devItems: devRoute(devItemsRoute, ({ ctx, query }: HandlerArgs<typeof devItemsRoute>) =>
    Promise.resolve(listDevItems(ctx, query)),
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
  devNotify: devRoute(devNotify, ({ ctx, body }: HandlerArgs<typeof devNotify>) => {
    if (ctx.userId === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Vous devez être connecté pour effectuer cette action.',
      );
    }
    return runNotifyDemo(ctx, body);
  }),
  devPersonalDataDeletion: devRoute(
    devPersonalDataDeletion,
    ({ ctx }: HandlerArgs<typeof devPersonalDataDeletion>) => runDeletionDemo(ctx),
  ),
  devPersonalDataDeletionCancel: devRoute(
    devPersonalDataDeletionCancel,
    ({ ctx }: HandlerArgs<typeof devPersonalDataDeletionCancel>) => cancelDeletionDemo(ctx),
  ),
  devPersonalDataExecute: devRoute(
    devPersonalDataExecute,
    ({ ctx }: HandlerArgs<typeof devPersonalDataExecute>) => runExecutionDemo(ctx),
  ),
  devPersonalDataExport: devRoute(
    devPersonalDataExport,
    ({ ctx }: HandlerArgs<typeof devPersonalDataExport>) => runExportDemo(ctx),
  ),
  devPushSend: devRoute(devPushSend, ({ ctx }: HandlerArgs<typeof devPushSend>) => {
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
  devRateLimitBurst: devRoute(
    devRateLimitBurst,
    async ({ ctx, body }: HandlerArgs<typeof devRateLimitBurst>) =>
      runBurst(ctx.clock, body.profile),
  ),
  devRateLimitOrigin: devRoute(
    devRateLimitOrigin,
    ({ body }: HandlerArgs<typeof devRateLimitOrigin>) => Promise.resolve(runOriginDemo(body.mode)),
  ),
  devRateLimitPurge: devRoute(devRateLimitPurge, ({ ctx }: HandlerArgs<typeof devRateLimitPurge>) =>
    runPurgeDemo(ctx.clock),
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
  devStripeEvents: devRoute(
    devStripeEvents,
    async ({ ctx }: HandlerArgs<typeof devStripeEvents>) => ({
      items: await listStripeEvents(ctx),
    }),
  ),
  devStripeSimulate: devRoute(
    devStripeSimulate,
    ({ ctx, body }: HandlerArgs<typeof devStripeSimulate>) =>
      simulateStripeAction(ctx, body.action),
  ),
  devUploadSimulation: devRoute(
    devUploadSimulation,
    ({ ctx, body }: HandlerArgs<typeof devUploadSimulation>) => simulateUpload(ctx, body),
  ),
} satisfies Record<string, SpecialHandler>;
