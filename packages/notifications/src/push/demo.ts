// Demonstration of the push channel (SPEC-205 EF-7): one in-app notification of the caller sent
// through the mock push service to the caller's own subscriptions. Only reachable through the
// `ENABLE_SDD_PAGES` route; the answer shows outcomes and codes, never an endpoint.
import type { PushDemoSendOutput } from '@learny/contracts';
import { createNotification } from '@learny/db';

import type { PushSystemContext } from './context';
import { sendPush, type PushDeps } from './send';
import { mockOutcomeOf } from './transport';

/** The notification of the demonstration: a public, impersonal reminder (EF-4). */
export const DEMO_PUSH_NOTIFICATION = {
  type: 'global_quiz_today',
  title: 'Votre quiz global du jour est prêt',
  body: 'Dix questions pour entretenir vos acquis. Comptez cinq minutes.',
  href: '/quiz/global',
  icon: 'calendar',
} as const;

export async function sendDemoPush(
  sctx: PushSystemContext,
  input: { userId: string },
  deps: PushDeps,
): Promise<PushDemoSendOutput> {
  const now = sctx.clock.now();
  const { notification } = await sctx.sdb.transaction((tx) =>
    createNotification(tx, {
      userId: input.userId,
      type: DEMO_PUSH_NOTIFICATION.type,
      title: DEMO_PUSH_NOTIFICATION.title,
      body: DEMO_PUSH_NOTIFICATION.body,
      href: DEMO_PUSH_NOTIFICATION.href,
      icon: DEMO_PUSH_NOTIFICATION.icon,
      createdAt: now,
    }),
  );
  const outcome = await sendPush(
    sctx,
    {
      userId: input.userId,
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        icon: notification.icon,
        href: notification.href,
      },
    },
    deps,
  );
  const status = outcome.delivery.status;
  return {
    notificationId: notification.id,
    payload: outcome.payload ?? {
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      url: notification.href,
      tag: notification.id,
    },
    delivery: {
      status: status === 'sent' || status === 'failed' ? status : 'skipped_pref',
      error: outcome.delivery.error,
      sentAt: outcome.delivery.sentAt === null ? null : outcome.delivery.sentAt.toISOString(),
    },
    attempts: outcome.attempts.map((attempt) => ({
      outcome: mockOutcomeOf(attempt.endpoint),
      statusCode: attempt.result.statusCode ?? 0,
      removed: attempt.removed,
      failureCount: attempt.failureCount,
    })),
    remainingSubscriptions: outcome.remainingSubscriptions,
  };
}
