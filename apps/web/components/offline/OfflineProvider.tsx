'use client';

import { useEffect, useRef } from 'react';

import { clock } from '@learny/core';
import { toast } from '@learny/ui';

import { readMeta } from '../../lib/offline/db';
import { prefetchPack } from '../../lib/offline/pack';
import { pendingCount } from '../../lib/offline/queue';
import { registerServiceWorker, requestBackgroundSync } from '../../lib/offline/register-sw';
import { syncQueue } from '../../lib/offline/sync';
import { fr } from '../../messages/fr';

const t = fr.offline.sync;

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
  const result = await syncQueue({ now: () => clock.now() });
  if (!result.ran) return;
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
      void registerServiceWorker().then((value) => {
        if (value !== null) {
          void requestBackgroundSync(value);
          navigator.serviceWorker.addEventListener('message', (event) => {
            if ((event.data as { type?: unknown }).type === 'learny-sync-request') void run();
          });
        }
      });
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
  await Promise.race([
    syncQueue({ now: () => clock.now() }).catch(() => undefined),
    new Promise((resolve) => {
      window.setTimeout(resolve, 5000);
    }),
  ]);
  return pendingCount();
}
