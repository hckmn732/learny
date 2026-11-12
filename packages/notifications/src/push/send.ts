// Sending one notification through the browser push channel (SPEC-205 EF-5, ET-5, CL-4, CL-5).
//
// The push service is called once per active subscription of the learner, then every database
// effect of the round is applied in a single transaction: successes reset the failure counter and
// stamp `last_success_at`, a 404 or 410 deletes the subscription at once, any other failure
// increments the counter and deletes at the fifth, and the delivery journal of SPEC-109 receives
// `sent` or `failed` for the `push` channel. A round that only met transient failures is reported
// as retryable so that the SPEC-203 job can run it again; the journal line is then updated, never
// duplicated, and a `sent` line is never reopened (ADR-0244).
import { eq, sql } from 'drizzle-orm';

import {
  createDelivery,
  getDelivery,
  pushSubscriptions,
  updateDeliveryStatus,
  type NotificationDelivery,
  type PushSubscription,
} from '@learny/db';

import type { PushSystemContext } from './context';
import {
  PUSH_TTL_SECONDS,
  buildPushPayload,
  serializePushPayload,
  type PushNotificationInput,
  type PushPayload,
} from './payload';
import type { PushSendResult, PushTransport } from './transport';

/** ADR-0055 — a subscription is dropped after this many consecutive non-definitive failures. */
export const PUSH_MAX_FAILURES = 5;

/** Safe error codes written to `notification_deliveries.error` (SPEC-109 ET-5). */
export const PUSH_ERROR_CODES = {
  noSubscription: 'no_subscription',
  gone: 'gone',
  transient: 'transient',
} as const;

export interface PushDeps {
  transport: PushTransport;
}

export interface SendPushInput {
  userId: string;
  notification: PushNotificationInput;
}

export interface PushAttempt {
  subscriptionId: string;
  /** Full endpoint, for the caller only: never logged, never shown by the demonstration. */
  endpoint: string;
  result: PushSendResult;
  /** The subscription was deleted by this round (404/410 or fifth failure). */
  removed: boolean;
  /** Failure counter after the round (0 after a success or a removal). */
  failureCount: number;
}

export interface PushSendOutcome {
  /** `skipped` when the learner has no subscription: nothing is sent (CA-4). */
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  /** True when every failure was transient: the job may retry the round (ET-5). */
  retryable: boolean;
  payload: PushPayload | null;
  attempts: PushAttempt[];
  delivery: NotificationDelivery;
  remainingSubscriptions: number;
}

export interface AttemptDecision {
  /** The subscription is deleted: 404/410 at once, or the fifth consecutive failure (CL-5). */
  removed: boolean;
  /** Counter after the attempt: 0 after a success or a removal, otherwise incremented. */
  failureCount: number;
}

/** EF-5, CL-4, CL-5 — the fate of one subscription after one answer of the push service. */
export function decideAttempt(failureCount: number, result: PushSendResult): AttemptDecision {
  if (result.ok) return { removed: false, failureCount: 0 };
  if (result.reason === 'gone') return { removed: true, failureCount: 0 };
  const next = failureCount + 1;
  if (next >= PUSH_MAX_FAILURES) return { removed: true, failureCount: 0 };
  return { removed: false, failureCount: next };
}

export interface RoundSummary {
  status: 'sent' | 'failed';
  error: string | null;
  retryable: boolean;
}

/**
 * EF-5, ET-5 — the journal line of a round: `sent` as soon as one subscription received the
 * message; otherwise `failed` with `gone` when every subscription was removed (definitive) or
 * `transient` when at least one may still succeed on a retry.
 */
export function summarizeRound(
  attempts: ReadonlyArray<Pick<PushAttempt, 'result' | 'removed'>>,
): RoundSummary {
  const sent = attempts.some((attempt) => attempt.result.ok);
  if (sent) return { status: 'sent', error: null, retryable: false };
  const allDefinitive = attempts.every((attempt) => attempt.removed);
  return {
    status: 'failed',
    error: allDefinitive ? PUSH_ERROR_CODES.gone : PUSH_ERROR_CODES.transient,
    retryable: !allDefinitive,
  };
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'invalid';
  }
}

/** Writes the push line of the journal: created once, updated while it is not `sent`. */
async function recordDelivery(
  tx: Parameters<typeof createDelivery>[0],
  notificationId: string,
  state: { status: 'sent' | 'failed' | 'skipped_pref'; sentAt: Date | null; error: string | null },
): Promise<NotificationDelivery> {
  const existing = await getDelivery(tx, { notificationId, channel: 'push' });
  if (existing === null) {
    const created = await createDelivery(tx, { notificationId, channel: 'push', ...state });
    return created.delivery;
  }
  if (existing.status === 'sent') return existing;
  return updateDeliveryStatus(tx, { deliveryId: existing.id, scheduledFor: null, ...state });
}

/**
 * EF-5 — sends `notification` to every active subscription of `userId` and records the result.
 * Never throws for a push service answer; only an invalid notification or a database failure does.
 */
export async function sendPush(
  sctx: PushSystemContext,
  input: SendPushInput,
  deps: PushDeps,
): Promise<PushSendOutcome> {
  const payload = buildPushPayload(input.notification);
  const body = serializePushPayload(payload);
  const now = sctx.clock.now();

  const subscriptions: PushSubscription[] = await sctx.sdb
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, input.userId))
    .orderBy(pushSubscriptions.createdAt, pushSubscriptions.id);

  if (subscriptions.length === 0) {
    const delivery = await sctx.sdb.transaction((tx) =>
      recordDelivery(tx, input.notification.id, {
        status: 'skipped_pref',
        sentAt: null,
        error: PUSH_ERROR_CODES.noSubscription,
      }),
    );
    return {
      status: 'skipped',
      error: PUSH_ERROR_CODES.noSubscription,
      retryable: false,
      payload,
      attempts: [],
      delivery,
      remainingSubscriptions: 0,
    };
  }

  // 1. The push service, outside any transaction (network time never holds a connection).
  const results: Array<{ subscription: PushSubscription; result: PushSendResult }> = [];
  for (const subscription of subscriptions) {
    const result = await deps.transport.send(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      body,
      { ttl: PUSH_TTL_SECONDS, topic: payload.tag.replaceAll('-', '').slice(0, 32) },
    );
    results.push({ subscription, result });
  }

  // 2. One transaction for the counters, the removals and the journal (ET-5).
  const attempts: PushAttempt[] = [];
  const delivery = await sctx.sdb.transaction(async (tx) => {
    for (const { subscription, result } of results) {
      const decision = decideAttempt(subscription.failureCount, result);
      if (decision.removed) {
        await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else if (result.ok) {
        await tx
          .update(pushSubscriptions)
          .set({ failureCount: 0, lastSuccessAt: now, updatedAt: now })
          .where(eq(pushSubscriptions.id, subscription.id));
      } else {
        await tx
          .update(pushSubscriptions)
          .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1`, updatedAt: now })
          .where(eq(pushSubscriptions.id, subscription.id));
      }
      attempts.push({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        result,
        removed: decision.removed,
        failureCount: decision.failureCount,
      });
      sctx.logger.info('push attempt', {
        requestId: sctx.requestId,
        userId: input.userId,
        status: result.statusCode ?? 0,
        outcome: result.ok ? 'sent' : result.reason,
        path: hostOf(subscription.endpoint),
      });
    }
    const summary = summarizeRound(attempts);
    return recordDelivery(tx, input.notification.id, {
      status: summary.status,
      sentAt: summary.status === 'sent' ? now : null,
      error: summary.error,
    });
  });

  const summary = summarizeRound(attempts);
  return {
    status: summary.status,
    error: summary.error,
    retryable: summary.retryable,
    payload,
    attempts,
    delivery,
    remainingSubscriptions: attempts.filter((attempt) => !attempt.removed).length,
  };
}
