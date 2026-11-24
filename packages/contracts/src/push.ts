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

// ---------------------------------------------------------------------------------------------
// Native device tokens (ADR-3007, SPEC-3501). The application obtains the token of the platform
// (`expo-notifications` `getDevicePushTokenAsync`: APNs on iOS, FCM on Android) and registers it
// under its `kind`; a browser keeps the Web Push form of SPEC-205, which stays the default so an
// existing client is never broken (EF-3).

/** Channels of a subscription: the browser one and the two native ones (ADR-3007). */
export const PUSH_SUBSCRIPTION_KINDS = ['webpush', 'apns', 'fcm'] as const;
export const PushSubscriptionKind = z.enum(PUSH_SUBSCRIPTION_KINDS);
export type PushSubscriptionKind = z.infer<typeof PushSubscriptionKind>;

/** Platforms a native token may come from; optional, kept for the settings page only. */
export const PushTokenPlatform = z.enum(['ios', 'android']);

/**
 * EF-1, ET-1 — the raw device token (APNs: 64 hex characters, FCM: `<instance>:<registration>`).
 * It is a credential of the device: never logged, never returned by any operation (ET-4).
 */
export const PushDeviceToken = z
  .string()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_.:-]+$/, { message: 'un jeton d’appareil est attendu' });

/** EF-1 — short description of the device, kept for the settings page (never a fingerprint). */
const DeviceName = z.string().trim().max(120);

/** EF-1 — the Web Push body of SPEC-205, unchanged: `kind` absent means `webpush`. */
const WebPushSubscriptionBody = z.object({
  kind: z.literal('webpush').default('webpush'),
  endpoint: PushEndpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: Base64Url(256), auth: Base64Url(128) }),
  /** Short description of the browser, kept for the settings page (never a fingerprint). */
  userAgent: z.string().trim().max(512).optional(),
});

/** EF-1 — the body of a native subscription: the token replaces the endpoint and the keys. */
const NativePushSubscriptionBody = z.object({
  kind: z.enum(['apns', 'fcm']),
  token: PushDeviceToken,
  platform: PushTokenPlatform.optional(),
  deviceName: DeviceName.optional(),
});

/**
 * EF-3 — `POST /me/push-subscriptions` accepts either form. The discriminated union keeps the
 * discriminating `kind` optional on the browser branch, so the historical body of SPEC-205 keeps
 * validating and the compatibility check of ADR-2004 passes.
 */
export const PushSubscriptionBody = z.discriminatedUnion('kind', [
  WebPushSubscriptionBody,
  NativePushSubscriptionBody,
]);

/** Request body as a client writes it (`kind` may be omitted on the browser form). */
export type PushSubscriptionBody = z.input<typeof PushSubscriptionBody>;
/** Request body once parsed: `kind` is always present. */
export type ParsedPushSubscriptionBody = z.output<typeof PushSubscriptionBody>;

/** EF-1 — the stored subscription: an identifier, never the keys back. */
export const PushSubscriptionOutput = z.object({
  id: Uuid,
  /** False when the endpoint already belonged to the caller and its keys were refreshed. */
  created: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type PushSubscriptionOutput = z.infer<typeof PushSubscriptionOutput>;

/** EF-2 — the caller names what it removes: a browser endpoint, or a native `(kind, token)`. */
export const PushUnsubscribeBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('webpush').default('webpush'),
    endpoint: z.string().min(1).max(PUSH_ENDPOINT_MAX_LENGTH),
  }),
  z.object({
    kind: z.enum(['apns', 'fcm']),
    token: PushDeviceToken,
  }),
]);
export type PushUnsubscribeBody = z.input<typeof PushUnsubscribeBody>;

export const pushSubscriptionsUpsert = defineRoute({
  id: 'pushSubscriptions.upsert',
  method: 'POST',
  path: '/api/v1/me/push-subscriptions',
  auth: 'user',
  body: PushSubscriptionBody,
  output: PushSubscriptionOutput,
  successStatus: 200,
  summary:
    'Enregistre ou rafraîchit l’abonnement push de l’appareil courant : Web Push du navigateur (SPEC-205) ou jeton natif APNs/FCM (SPEC-3501). Idempotent sur le point de terminaison ou le jeton.',
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
    'Retire l’abonnement push de l’appareil courant : Web Push (SPEC-205) ou jeton natif (SPEC-3501). Idempotent : une suppression répétée répond 204.',
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

