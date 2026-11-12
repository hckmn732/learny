// Browser side of the push channel (SPEC-205 EF-3, CL-1, CL-2, CL-7). The permission is asked only
// from `enableBrowserPush`, i.e. after an explicit click; a refused permission is reported, never
// asked again automatically, and the in-app inbox stays the always-on channel (BR-NOT-03). The
// browser APIs are injected so that the flow runs identically against a real browser and against
// the simulated one of the SDD demonstration.
import type { PushSubscriptionBody } from '@learny/contracts';

export type BrowserPermission = 'default' | 'granted' | 'denied';

/** The subset of the Web Push APIs the flow needs (`Notification`, `ServiceWorker`, `PushManager`). */
export interface PushBrowser {
  /** `false` when `Notification`, `navigator.serviceWorker` or `PushManager` is missing (CL-2). */
  supported: boolean;
  permission: () => BrowserPermission;
  requestPermission: () => Promise<BrowserPermission>;
  /** Registers `/sw.js` and resolves once the worker is ready. */
  register: () => Promise<PushRegistration>;
  userAgent: () => string;
}

export interface PushRegistration {
  getSubscription: () => Promise<PushSubscriptionBody | null>;
  subscribe: (applicationServerKey: Uint8Array) => Promise<PushSubscriptionBody>;
  unsubscribe: () => Promise<boolean>;
}

export type EnablePushOutcome =
  | { state: 'subscribed'; subscription: PushSubscriptionBody; permissionRequested: boolean }
  | { state: 'denied'; permissionRequested: boolean }
  | { state: 'dismissed'; permissionRequested: boolean }
  | { state: 'unsupported' }
  | { state: 'unconfigured' };

export interface EnablePushOptions {
  browser: PushBrowser;
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, base64url; `undefined` when the channel is not configured. */
  publicKey: string | undefined;
  /** Sends the subscription to `POST /api/v1/me/push-subscriptions`. */
  save: (subscription: PushSubscriptionBody) => Promise<unknown>;
}

/** Base64url → bytes, the form `PushManager.subscribe` expects for `applicationServerKey`. */
export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** CL-2 — feature detection without touching any API that could throw or prompt. */
export function detectPushBrowser(window: Window | undefined): PushBrowser {
  const unsupported: PushBrowser = {
    supported: false,
    permission: () => 'default',
    requestPermission: () => Promise.resolve('default'),
    register: () => Promise.reject(new Error('push non pris en charge')),
    userAgent: () => '',
  };
  if (window === undefined) return unsupported;
  const notification = (window as { Notification?: typeof Notification }).Notification;
  const serviceWorker = window.navigator.serviceWorker as ServiceWorkerContainer | undefined;
  const hasPushManager = 'PushManager' in window;
  if (notification === undefined || serviceWorker === undefined || !hasPushManager) {
    return unsupported;
  }
  return {
    supported: true,
    permission: () => notification.permission,
    requestPermission: () => notification.requestPermission(),
    userAgent: () => window.navigator.userAgent.slice(0, 512),
    register: async () => {
      await serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await serviceWorker.ready;
      const toBody = (subscription: PushSubscription): PushSubscriptionBody => {
        const json = subscription.toJSON();
        return {
          endpoint: json.endpoint ?? subscription.endpoint,
          expirationTime: json.expirationTime ?? null,
          keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        };
      };
      return {
        getSubscription: async () => {
          const current = await registration.pushManager.getSubscription();
          return current === null ? null : toBody(current);
        },
        subscribe: async (applicationServerKey) =>
          toBody(
            await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: applicationServerKey as BufferSource,
            }),
          ),
        unsubscribe: async () => {
          const current = await registration.pushManager.getSubscription();
          return current === null ? true : current.unsubscribe();
        },
      };
    },
  };
}

let inFlight: Promise<EnablePushOutcome> | null = null;

/**
 * EF-3, CL-7 — asks the permission (only when it is still `default`), registers the worker,
 * subscribes with the public VAPID key and saves the subscription. Concurrent calls share one
 * run: a double click asks once and creates one subscription.
 */
export function enableBrowserPush(options: EnablePushOptions): Promise<EnablePushOutcome> {
  if (inFlight !== null) return inFlight;
  inFlight = run(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(options: EnablePushOptions): Promise<EnablePushOutcome> {
  const { browser } = options;
  if (!browser.supported) return { state: 'unsupported' };
  if (options.publicKey === undefined || options.publicKey === '') return { state: 'unconfigured' };

  let permission = browser.permission();
  let permissionRequested = false;
  if (permission === 'default') {
    permissionRequested = true;
    permission = await browser.requestPermission();
  }
  if (permission === 'denied') return { state: 'denied', permissionRequested };
  if (permission !== 'granted') return { state: 'dismissed', permissionRequested };

  const registration = await browser.register();
  const existing = await registration.getSubscription();
  const subscription =
    existing ?? (await registration.subscribe(urlBase64ToUint8Array(options.publicKey)));
  const body: PushSubscriptionBody = {
    ...subscription,
    ...(browser.userAgent() === '' ? {} : { userAgent: browser.userAgent() }),
  };
  await options.save(body);
  return { state: 'subscribed', subscription: body, permissionRequested };
}

/** EF-2 — unsubscribes the browser and tells the server; both steps are idempotent. */
export async function disableBrowserPush(options: {
  browser: PushBrowser;
  remove: (endpoint: string) => Promise<unknown>;
}): Promise<{ removed: boolean }> {
  if (!options.browser.supported) return { removed: false };
  const registration = await options.browser.register();
  const current = await registration.getSubscription();
  if (current === null) return { removed: false };
  await registration.unsubscribe();
  await options.remove(current.endpoint);
  return { removed: true };
}
