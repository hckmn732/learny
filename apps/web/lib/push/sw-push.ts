// Push handlers of the single service worker (SPEC-205 EF-4, ET-4; merged into the Serwist worker
// by SPEC-801). A push shows a bounded title, body and icon; a click opens or focuses an internal
// page of this origin and ignores anything else. No secret, no cache write happens here.

const MAX_TITLE = 120;
const MAX_BODY = 400;
const DEFAULT_TITLE = 'Learny';
const DEFAULT_ICON = '/icons/notification.png';
const ICONS: Record<string, string> = {};

interface WorkerClient {
  url: string;
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
}

export interface PushWorkerScope {
  location: { origin: string };
  addEventListener: (type: string, listener: (event: never) => void) => void;
  registration: { showNotification: (title: string, options: unknown) => Promise<void> };
  clients: {
    matchAll: (options: { type: string; includeUncontrolled: boolean }) => Promise<WorkerClient[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
}

interface PushEventLike {
  data?: { json: () => unknown } | null;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface NotificationClickLike {
  notification: { data?: { url?: unknown }; close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Short, plain text only: no markup is interpreted by the notification UI, but bounds matter. */
export function safeText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex -- control characters are stripped on purpose
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text === '') return fallback;
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Icon slug → bundled image; an unknown slug falls back to the default icon, never a URL. */
export function iconFor(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value)) return DEFAULT_ICON;
  return Object.prototype.hasOwnProperty.call(ICONS, value)
    ? (ICONS[value] ?? DEFAULT_ICON)
    : DEFAULT_ICON;
}

/**
 * The only URL a click may open: an internal path resolved against this origin (CL-6). Same rule
 * as `safeNotificationUrl` of @learny/notifications: no scheme, no protocol-relative URL, no
 * backslash or whitespace, and the resolved origin must be this worker's origin.
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

function parsePayload(data: PushEventLike['data']): Record<string, unknown> {
  if (!data) return {};
  try {
    const json: unknown = data.json();
    return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function registerPushHandlers(scope: PushWorkerScope): void {
  scope.addEventListener('push', (event: PushEventLike) => {
    const payload = parsePayload(event.data);
    const url = safeNotificationUrl(scope.location.origin, payload.url);
    const options = {
      body: safeText(payload.body, MAX_BODY, ''),
      icon: iconFor(payload.icon),
      data: { url },
      tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 64) : undefined,
    };
    event.waitUntil(
      scope.registration.showNotification(
        safeText(payload.title, MAX_TITLE, DEFAULT_TITLE),
        options,
      ),
    );
  });

  scope.addEventListener('notificationclick', (event: NotificationClickLike) => {
    event.notification.close();
    const data = event.notification.data ?? {};
    const target = safeNotificationUrl(scope.location.origin, data.url);
    if (target === null) {
      // External, malformed or absent URL: no navigation at all (CL-6).
      return;
    }
    event.waitUntil(
      scope.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(async (clients) => {
          for (const client of clients) {
            if (typeof client.url === 'string' && client.url.startsWith(scope.location.origin)) {
              if (client.navigate !== undefined) {
                const navigated = await client.navigate(target);
                return navigated !== null && typeof navigated === 'object' && 'focus' in navigated
                  ? (navigated as { focus: () => Promise<unknown> }).focus()
                  : navigated;
              }
              return client.focus?.();
            }
          }
          return scope.clients.openWindow(target);
        }),
    );
  });
}
