// Service worker of Learny (SPEC-205 EF-4, ET-4). It only handles browser notifications: it caches
// nothing, stores nothing and never sees a VAPID private key. A push shows a bounded title, body
// and icon; a click opens or focuses an internal page of this origin and ignores anything else.
/* eslint-disable no-undef */
'use strict';

const MAX_TITLE = 120;
const MAX_BODY = 400;
const DEFAULT_TITLE = 'Learny';
const ICONS = { default: '/icons/notification.png' };

/** Short, plain text only: no markup is interpreted by the notification UI, but bounds matter. */
function safeText(value, max, fallback) {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex -- control characters are stripped on purpose
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text === '') return fallback;
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Icon slug → bundled image; an unknown slug falls back to the default icon, never a URL. */
function iconFor(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value)) return ICONS.default;
  return Object.prototype.hasOwnProperty.call(ICONS, value) ? ICONS[value] : ICONS.default;
}

/**
 * The only URL a click may open: an internal path resolved against this origin (CL-6). Same rule
 * as `safeNotificationUrl` of @learny/notifications: no scheme, no protocol-relative URL, no
 * backslash or whitespace, and the resolved origin must be this worker's origin.
 */
function safeNotificationUrl(origin, candidate) {
  if (typeof candidate !== 'string' || candidate === '') return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (/[\s\\]/.test(candidate)) return null;
  var base;
  var url;
  try {
    base = new URL(origin);
    url = new URL(candidate, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin || url.protocol !== base.protocol) return null;
  return url.href;
}

function parsePayload(data) {
  if (!data) return {};
  try {
    var json = data.json();
    return json && typeof json === 'object' ? json : {};
  } catch {
    return {};
  }
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var payload = parsePayload(event.data);
  var url = safeNotificationUrl(self.location.origin, payload.url);
  var options = {
    body: safeText(payload.body, MAX_BODY, ''),
    icon: iconFor(payload.icon),
    data: { url: url },
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 64) : undefined,
  };
  event.waitUntil(
    self.registration.showNotification(safeText(payload.title, MAX_TITLE, DEFAULT_TITLE), options),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var target = safeNotificationUrl(self.location.origin, data.url);
  if (target === null) {
    // External, malformed or absent URL: no navigation at all (CL-6).
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i += 1) {
        var client = clients[i];
        if (typeof client.url === 'string' && client.url.indexOf(self.location.origin) === 0) {
          if ('navigate' in client) {
            return client.navigate(target).then(function (navigated) {
              return navigated && 'focus' in navigated ? navigated.focus() : navigated;
            });
          }
          return 'focus' in client ? client.focus() : undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
