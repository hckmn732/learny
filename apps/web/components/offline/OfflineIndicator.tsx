'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fr } from '@learny/i18n/fr/offline';

import { useOnlineStatus } from '../../lib/offline/use-online-status';

const t = fr.offline.indicator;

/**
 * EF-9 — header pill left of the bell. It shows « Hors ligne » when the browser is offline and
 * « n en attente » when the queue holds at least one pending entry; absent otherwise.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void import('../../lib/offline/queue')
        .then(({ pendingCount }) => pendingCount())
        .then((value) => {
          if (mounted) setPending(value);
        })
        .catch(() => undefined);
    };
    refresh();
    const onChange = () => {
      refresh();
    };
    window.addEventListener('learny-offline-queue', onChange);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      mounted = false;
      window.removeEventListener('learny-offline-queue', onChange);
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  if (online && pending === 0) return null;
  return (
    <span
      aria-live="polite"
      className="flex h-32 items-center gap-8 rounded-full bg-ink px-12 text-13 font-600 text-white"
      data-testid="offline-indicator"
      role="status"
    >
      <WifiOff aria-hidden="true" className="h-14 w-14" />
      {online ? null : <span>{t.offline}</span>}
      {pending > 0 ? (
        <span
          aria-label={t.pendingLabel(pending)}
          className="rounded-full bg-lime px-7 py-1 text-11 font-700 text-ink"
          data-testid="offline-pending-count"
        >
          {t.pending(pending)}
        </span>
      ) : null}
    </span>
  );
}
