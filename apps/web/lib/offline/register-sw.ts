// Registration of the single service worker at scope `/` (SPEC-801 EF-3, CL-8; ET-2). Disabled in
// development so `next dev` never caches a partial build; the browser's own updater activates a
// new version on the next full load (`skipWaiting: false` in `app/sw.ts`).

export const OFFLINE_SYNC_TAG = 'learny-offline-answers';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (process.env.NODE_ENV !== 'production') return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch {
    // CL-8 — a refused service worker is invisible: the online application keeps working.
    return null;
  }
}

/** EF-8 — asks the browser for a background sync when the API exists. */
export async function requestBackgroundSync(
  registration: ServiceWorkerRegistration | null,
): Promise<void> {
  const sync = registration?.sync;
  if (sync === undefined) return;
  try {
    await sync.register(OFFLINE_SYNC_TAG);
  } catch {
    // Unsupported or refused: the `online` trigger remains.
  }
}
