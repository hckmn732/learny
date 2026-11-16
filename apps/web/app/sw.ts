/// <reference lib="webworker" />
// Single service worker of Learny (SPEC-801 ET-2, ADR-0200; merges the push handlers of SPEC-205).
// Precache of the static build, image/font caches, navigation fallback to the offline pages and
// the background `sync` trigger of the answer queue. `/api/**` is deliberately NOT intercepted:
// no API response ever enters the Cache Storage (ET-11), and Playwright request interception keeps
// working in the end-to-end tests. A new version waits for the next full load (`skipWaiting:false`).

import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist';

import { clock } from '@learny/core';

import { syncQueue } from '../lib/offline/sync';
import { registerPushHandlers, type PushWorkerScope } from '../lib/push/sw-push';

declare const __SW_MANIFEST: (string | { url: string; revision?: string | null })[];
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST?: unknown };

const manifest = __SW_MANIFEST;
self.__SW_MANIFEST = manifest;

const IMAGE_CACHE = 'learny-images';
const FONT_CACHE = 'learny-fonts';
const DAY = 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: manifest,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/_next/image') || url.pathname.startsWith('/icons/'),
      handler: new CacheFirst({
        cacheName: IMAGE_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * DAY })],
      }),
    },
    {
      matcher: ({ url }) => /\/_next\/static\/media\/.*\.woff2$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: FONT_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * DAY })],
      }),
    },
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
  ],
});

async function cachedPage(url: string): Promise<Response | undefined> {
  const key = serwist.getPrecacheKeyForUrl(url);
  if (key !== undefined) {
    const match = await caches.match(key);
    if (match !== undefined) return match;
  }
  return caches.match(url, { ignoreSearch: true });
}

serwist.setCatchHandler(async ({ request }) => {
  if (request.mode !== 'navigate') return Response.error();
  const path = new URL(request.url).pathname;
  const target = /^\/formations\/[^/]+\/quiz-global(?:\/|$)/.test(path)
    ? '/hors-ligne/revisions'
    : '/hors-ligne';
  return (await cachedPage(target)) ?? Response.error();
});

serwist.addEventListeners();

registerPushHandlers(self as unknown as PushWorkerScope);

self.addEventListener('sync', (event) => {
  const sync = event as ExtendableEvent & { tag?: string };
  if (sync.tag !== 'learny-offline-answers') return;
  sync.waitUntil(syncQueue({ now: () => clock.now() }).catch(() => undefined));
});
