import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the browser push channel (SPEC-205 ET-1, docs/architecture/api.md §2). A
// subscription is what `PushManager.subscribe()` hands to the page: an HTTPS endpoint of the push
// service and the two client keys. The server never receives, stores or returns a VAPID private key.

/** Longest endpoint accepted (also the database bound of `push_subscriptions.endpoint`). */
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

/** Host of the deterministic mock push service (`PUSH_MODE=mock`, EF-6): never resolved. */
export const MOCK_PUSH_HOST = 'push.mock.learny.test';

/**
 * Outcomes the mock push service simulates, chosen by the last path segment of the endpoint
 * (`https://push.mock.learny.test/<anything>/<outcome>`), without any network access (EF-6).
 */
export const MOCK_PUSH_OUTCOMES = ['success', 'missing', 'gone', 'transient'] as const;
export const MockPushOutcome = z.enum(MOCK_PUSH_OUTCOMES);
export type MockPushOutcome = z.infer<typeof MockPushOutcome>;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/**
 * ET-3 — an endpoint the server may contact: HTTPS only, no credentials, a public host name (no
 * IP literal, no `localhost`, no single-label or local-only name), bounded length. The check is
 * syntactic: no DNS lookup happens here, and the live transport never follows a redirection.
 */
export function isPublicPushEndpoint(value: string): boolean {
  if (value.length > PUSH_ENDPOINT_MAX_LENGTH || /[\s\\]/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  if (host === '' || host === 'localhost' || host.startsWith('[') || IPV4.test(host)) return false;
  if (!host.includes('.') || host.endsWith('.')) return false;
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return true;
}

/** EF-1 — HTTPS endpoint of a public push service (CL-3, ET-3). */
export const PushEndpoint = z
  .string()
  .min(1)
  .max(PUSH_ENDPOINT_MAX_LENGTH)
  .refine(isPublicPushEndpoint, { message: 'un point de terminaison HTTPS public est attendu' });

/** Base64url material of the client keys (`p256dh` 65 bytes, `auth` 16 bytes once decoded). */
const Base64Url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, { message: 'une valeur base64url est attendue' });

/** EF-1 — the serialised `PushSubscription` of the browser (`subscription.toJSON()`). */
export const PushSubscriptionBody = z.object({
  endpoint: PushEndpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: Base64Url(256), auth: Base64Url(128) }),
  /** Short description of the browser, kept for the settings page (never a fingerprint). */
  userAgent: z.string().trim().max(512).optional(),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

/** EF-1 — the stored subscription: an identifier, never the keys back. */
export const PushSubscriptionOutput = z.object({
  id: Uuid,
  /** False when the endpoint already belonged to the caller and its keys were refreshed. */
  created: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type PushSubscriptionOutput = z.infer<typeof PushSubscriptionOutput>;

/** EF-2 — the browser names the endpoint it is removing; the answer never says whether it existed. */
export const PushUnsubscribeBody = z.object({
  endpoint: z.string().min(1).max(PUSH_ENDPOINT_MAX_LENGTH),
});
export type PushUnsubscribeBody = z.infer<typeof PushUnsubscribeBody>;

export const pushSubscriptionsUpsert = defineRoute({
  id: 'pushSubscriptions.upsert',
  method: 'POST',
  path: '/api/v1/me/push-subscriptions',
  auth: 'user',
  body: PushSubscriptionBody,
  output: PushSubscriptionOutput,
  successStatus: 200,
  summary:
    'Enregistre ou rafraîchit l’abonnement Web Push du navigateur courant (SPEC-205). Idempotent sur le point de terminaison.',
  errors: ['VALIDATION_FAILED', 'FORBIDDEN'],
});

export const pushSubscriptionsDelete = defineRoute({
  id: 'pushSubscriptions.delete',
  method: 'DELETE',
  path: '/api/v1/me/push-subscriptions',
  auth: 'user',
  body: PushUnsubscribeBody,
  output: null,
  successStatus: 204,
  summary:
    'Retire l’abonnement Web Push du navigateur courant (SPEC-205). Idempotent : une suppression répétée répond 204.',
  errors: ['VALIDATION_FAILED'],
});

export const pushRoutes = { pushSubscriptionsUpsert, pushSubscriptionsDelete } as const;

// ---------------------------------------------------------------------------------------------
// Demonstration route (EF-7): active only with ENABLE_SDD_PAGES, never in production.

/** One attempt of the mock push service, as shown by the demonstration journal. */
export const PushDemoAttempt = z.object({
  /** Simulated outcome read from the endpoint, never the endpoint itself. */
  outcome: MockPushOutcome,
  statusCode: z.number().int(),
  /** The subscription was deleted by this attempt (404/410 or fifth failure). */
  removed: z.boolean(),
  /** Failure counter after the attempt (0 after a success or a removal). */
  failureCount: z.number().int().min(0),
});
export type PushDemoAttempt = z.infer<typeof PushDemoAttempt>;

export const PushDemoSendOutput = z.object({
  notificationId: Uuid,
  /** Payload as handed to the push service: title, body, icon and internal URL only (EF-4). */
  payload: z.object({
    title: z.string(),
    body: z.string(),
    icon: z.string(),
    url: z.string(),
    tag: z.string(),
  }),
  delivery: z.object({
    status: z.enum(['sent', 'failed', 'skipped_pref']),
    error: z.string().nullable(),
    sentAt: IsoDateTime.nullable(),
  }),
  attempts: z.array(PushDemoAttempt),
  /** Subscriptions of the caller still active after the send. */
  remainingSubscriptions: z.number().int().min(0),
});
export type PushDemoSendOutput = z.infer<typeof PushDemoSendOutput>;

export const devPushSend = defineRoute({
  id: 'dev.pushSend',
  method: 'POST',
  path: '/api/v1/dev/sdd/push/send',
  auth: 'user',
  output: PushDemoSendOutput,
  successStatus: 201,
  summary:
    'Route de démonstration : crée une notification de l’utilisateur courant et l’envoie par le canal push simulé (SPEC-205).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND'],
});

export const pushDevRoutes = { devPushSend } as const;
