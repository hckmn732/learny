// Unit tests of the browser flow (SPEC-205 EF-3, CL-1, CL-2, CL-7) against a simulated browser.
import { describe, expect, it } from 'vitest';

import type { PushSubscriptionBody } from '@learny/contracts';

import {
  detectPushBrowser,
  disableBrowserPush,
  enableBrowserPush,
  urlBase64ToUint8Array,
  type BrowserPermission,
  type PushBrowser,
  type PushRegistration,
} from './push';

const KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

interface Simulated {
  browser: PushBrowser;
  requests: number;
  subscriptions: number;
  current: PushSubscriptionBody | null;
}

function simulate(
  initial: BrowserPermission,
  answer: BrowserPermission = initial,
  options: { supported?: boolean; slowPermission?: boolean } = {},
): Simulated {
  let permission = initial;
  const state = { requests: 0, subscriptions: 0, current: null } as Omit<Simulated, 'browser'> &
    Partial<Pick<Simulated, 'browser'>>;
  const registration: PushRegistration = {
    getSubscription: () => Promise.resolve(state.current),
    subscribe: (serverKey) => {
      state.subscriptions += 1;
      state.current = {
        endpoint: `https://push.mock.learny.test/sim/${String(serverKey.length)}/success`,
        expirationTime: null,
        keys: { p256dh: 'p256dh', auth: 'auth' },
      };
      return Promise.resolve(state.current);
    },
    unsubscribe: () => {
      state.current = null;
      return Promise.resolve(true);
    },
  };
  state.browser = {
    supported: options.supported ?? true,
    permission: () => permission,
    requestPermission: async () => {
      state.requests += 1;
      if (options.slowPermission === true) await new Promise((resolve) => setTimeout(resolve, 5));
      permission = answer;
      return answer;
    },
    register: () => Promise.resolve(registration),
    userAgent: () => 'Simulated/1.0',
  };
  return state as Simulated;
}

describe('[SPEC-205] browser push flow', () => {
  it('decodes the base64url public key into the 65 bytes of an uncompressed P-256 point', () => {
    const bytes = urlBase64ToUint8Array(KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('asks the permission once, subscribes with the key and saves the subscription (EF-3)', async () => {
    const sim = simulate('default', 'granted');
    const saved: PushSubscriptionBody[] = [];
    const outcome = await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: (body) => {
        saved.push(body);
        return Promise.resolve();
      },
    });
    expect(outcome.state).toBe('subscribed');
    expect(sim.requests).toBe(1);
    expect(sim.subscriptions).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.endpoint).toBe('https://push.mock.learny.test/sim/65/success');
    expect(saved[0]?.userAgent).toBe('Simulated/1.0');
  });

  it('reports a refused permission without subscribing or saving anything (CL-1)', async () => {
    const sim = simulate('default', 'denied');
    let saves = 0;
    const outcome = await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => {
        saves += 1;
        return Promise.resolve();
      },
    });
    expect(outcome).toEqual({ state: 'denied', permissionRequested: true });
    expect(sim.subscriptions).toBe(0);
    expect(saves).toBe(0);
    // Already denied: the browser is not asked again (EF-3).
    const again = await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => Promise.resolve(),
    });
    expect(again).toEqual({ state: 'denied', permissionRequested: false });
    expect(sim.requests).toBe(1);
  });

  it('treats a dismissed prompt as no subscription, and asks again only on the next click', async () => {
    const sim = simulate('default', 'default');
    const outcome = await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => Promise.resolve(),
    });
    expect(outcome).toEqual({ state: 'dismissed', permissionRequested: true });
    expect(sim.subscriptions).toBe(0);
  });

  it('never prompts when the browser has no Push API or the key is not configured (CL-2)', async () => {
    const missing = simulate('default', 'granted', { supported: false });
    expect(
      await enableBrowserPush({
        browser: missing.browser,
        publicKey: KEY,
        save: () => Promise.resolve(),
      }),
    ).toEqual({ state: 'unsupported' });
    expect(missing.requests).toBe(0);
    const unconfigured = simulate('default', 'granted');
    expect(
      await enableBrowserPush({
        browser: unconfigured.browser,
        publicKey: undefined,
        save: () => Promise.resolve(),
      }),
    ).toEqual({ state: 'unconfigured' });
    expect(unconfigured.requests).toBe(0);
    expect(detectPushBrowser(undefined).supported).toBe(false);
    expect(detectPushBrowser({ navigator: {} } as unknown as Window).supported).toBe(false);
  });

  it('shares one run between two simultaneous clicks: one prompt, one subscription (CL-7)', async () => {
    const sim = simulate('default', 'granted', { slowPermission: true });
    let saves = 0;
    const save = () => {
      saves += 1;
      return Promise.resolve();
    };
    const [first, second] = await Promise.all([
      enableBrowserPush({ browser: sim.browser, publicKey: KEY, save }),
      enableBrowserPush({ browser: sim.browser, publicKey: KEY, save }),
    ]);
    expect(first.state).toBe('subscribed');
    expect(second).toBe(first);
    expect(sim.requests).toBe(1);
    expect(sim.subscriptions).toBe(1);
    expect(saves).toBe(1);
  });

  it('reuses an existing browser subscription instead of creating a second one', async () => {
    const sim = simulate('granted');
    await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => Promise.resolve(),
    });
    await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => Promise.resolve(),
    });
    expect(sim.subscriptions).toBe(1);
  });

  it('unsubscribes the browser then the server, and is idempotent (EF-2)', async () => {
    const sim = simulate('granted');
    await enableBrowserPush({
      browser: sim.browser,
      publicKey: KEY,
      save: () => Promise.resolve(),
    });
    const removed: string[] = [];
    const remove = (endpoint: string) => {
      removed.push(endpoint);
      return Promise.resolve();
    };
    expect(await disableBrowserPush({ browser: sim.browser, remove })).toEqual({ removed: true });
    expect(removed).toEqual(['https://push.mock.learny.test/sim/65/success']);
    expect(await disableBrowserPush({ browser: sim.browser, remove })).toEqual({ removed: false });
    expect(removed).toHaveLength(1);
  });
});
