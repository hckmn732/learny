'use client';

import { useEffect, useRef } from 'react';

import { clock } from '@learny/core';
import { toast } from '@learny/ui';

// The offline stack (IndexedDB, pack, queue) is only downloaded when the shell starts it after the
// first paint or when the network changes (SPEC-804): it never weighs on the initial bundle.
const offline = {
  db: () => import('../../lib/offline/db'),
  pack: () => import('../../lib/offline/pack'),
  queue: () => import('../../lib/offline/queue'),
  register: () => import('../../lib/offline/register-sw'),
  sync: () => import('../../lib/offline/sync'),
  messages: () => import('../../messages/fr/offline'),
};

let registered = false;

function whenIdle(callback: () => void): void {
  const idle = (
    window as unknown as {
      requestIdleCallback?: (this: Window, cb: () => void) => number;
    }
  ).requestIdleCallback;
  if (idle !== undefined) {
    idle.call(window, callback);
    return;
  }
  window.setTimeout(callback, 2000);
}

async function synchronise(): Promise<void> {
  const [{ syncQueue }, { fr }] = await Promise.all([offline.sync(), offline.messages()]);
  const result = await syncQueue({ now: () => clock.now() });
  if (!result.ran) return;
  const t = fr.offline.sync;
  if (result.synced > 0) toast({ title: t.done(result.synced) });
  if (result.conflicts > 0) toast({ title: t.conflict, tone: 'error' });
  if (result.rejected > 0) toast({ title: t.rejected(result.rejected), tone: 'error' });
}

function browserLocalDay(now: Date): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

async function prefetchIfStale(): Promise<void> {
  const [{ readMeta }, { prefetchPack }] = await Promise.all([offline.db(), offline.pack()]);
  const meta = await readMeta('lastPack');
  if (meta?.localDate !== browserLocalDay(clock.now())) {
    await prefetchPack({ clock });
  }
}

/**
 * EF-4, EF-8 — mounted by the connected shell. Registers the single service worker, synchronises
 * the queue and preloads the pack of the day after the first paint, then repeats on `online`,
 * `visibilitychange` and the service-worker `sync` event. The order is always « synchronise then
 * preload » (CL-8): `getToday` closes yesterday's session, a late sync would conflict.
 */
export function OfflineProvider() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async (): Promise<void> => {
      try {
        await synchronise();
        await prefetchIfStale();
      } catch {
        // Offline or storage refused: the online application keeps working (CL-7, CL-8).
      }
    };

    if (!registered) {
      registered = true;
      void offline.register().then(({ registerServiceWorker, requestBackgroundSync }) =>
        registerServiceWorker().then((value) => {
          if (value !== null) {
            void requestBackgroundSync(value);
            navigator.serviceWorker.addEventListener('message', (event) => {
              if ((event.data as { type?: unknown }).type === 'learny-sync-request') void run();
            });
          }
        }),
      );
    }

    whenIdle(() => {
      void run();
    });
    const onOnline = () => {
      void run();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}

/** EF-8/CL-6 — best-effort synchronisation before sign-out, bounded to five seconds. */
export async function flushBeforeSignOut(): Promise<number> {
  const [{ syncQueue }, { pendingCount }] = await Promise.all([offline.sync(), offline.queue()]);
  await Promise.race([
    syncQueue({ now: () => clock.now() }).catch(() => undefined),
    new Promise((resolve) => {
      window.setTimeout(resolve, 5000);
    }),
  ]);
  return pendingCount();
}
