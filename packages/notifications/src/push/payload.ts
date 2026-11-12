// Payload of a browser notification (SPEC-205 EF-4, ET-3): the minimum the service worker needs
// to show a safe notification and open an internal page. Nothing personal travels through the push
// service: no contribution, course, key or e-mail address, only the short title and body already
// written for the in-app inbox (SPEC-109 bounds) and an internal path.
import { z } from 'zod';

import { AppError } from '@learny/core';
import {
  notificationBodySchema,
  notificationHrefSchema,
  notificationIconSchema,
  notificationTitleSchema,
} from '@learny/db';

/** Time-to-live asked from the push service: a reminder older than a day is pointless. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Largest payload a push service accepts (RFC 8030 §7.2 recommends ≤ 4 KB). */
export const PUSH_PAYLOAD_MAX_BYTES = 4096;

/** What the service worker receives in `event.data.json()` (EF-4). */
export interface PushPayload {
  title: string;
  body: string;
  /** Icon slug of the notification (SPEC-109); the worker maps it to a bundled image. */
  icon: string;
  /** Internal path opened on click, re-checked by the worker against its own origin. */
  url: string;
  /** Notification identifier: the browser replaces a notification shown twice. */
  tag: string;
}

export interface PushNotificationInput {
  id: string;
  title: string;
  body: string;
  icon: string;
  href: string;
}

const payloadSchema = z.object({
  id: z.uuid(),
  title: notificationTitleSchema,
  body: notificationBodySchema,
  icon: notificationIconSchema,
  href: notificationHrefSchema,
});

/** EF-4, ET-3 — builds and bounds the payload; an external or malformed href is refused here. */
export function buildPushPayload(notification: PushNotificationInput): PushPayload {
  const parsed = payloadSchema.safeParse(notification);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Notification push invalide.', {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  const payload: PushPayload = {
    title: parsed.data.title,
    body: parsed.data.body,
    icon: parsed.data.icon,
    url: parsed.data.href,
    tag: parsed.data.id,
  };
  if (Buffer.byteLength(serializePushPayload(payload), 'utf8') > PUSH_PAYLOAD_MAX_BYTES) {
    throw new AppError('VALIDATION_FAILED', 'Notification push trop volumineuse.');
  }
  return payload;
}

export function serializePushPayload(payload: PushPayload): string {
  return JSON.stringify(payload);
}

/**
 * EF-4, CL-6 — the only URL a notification click may open: an internal path resolved against the
 * worker's origin. Anything else (another origin, a scheme such as `javascript:`, a
 * protocol-relative URL, a backslash trick) yields `null` and no navigation happens. The service
 * worker (`apps/web/public/sw.js`) carries the same rule, tested byte for byte in
 * `apps/web/lib/sw.test.ts`.
 */
export function safeNotificationUrl(origin: string, candidate: unknown): string | null {
  if (typeof candidate !== 'string' || candidate === '') return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (/[\s\\]/.test(candidate)) return null;
  let base: URL;
  let url: URL;
  try {
    base = new URL(origin);
    url = new URL(candidate, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin || url.protocol !== base.protocol) return null;
  return url.href;
}
