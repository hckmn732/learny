import type { PushSubscriptionBody } from '@learny/contracts';

import { api } from './api-client';
import { detectPushBrowser, enableBrowserPush, type BrowserPermission } from './push';

export interface PushGateway {
  supported: boolean;
  permission: () => BrowserPermission;
  requestPermission: () => Promise<BrowserPermission>;
  subscribe: () => Promise<boolean>;
}

/**
 * SPEC-602 EF-10 — the real browser flow of SPEC-205. The permission is asked only from the click;
 * a missing API or public key resolves `false`, which then stores `channel_push = false`.
 */
export function createPushGateway(publicKey: string | undefined): PushGateway {
  const browser = detectPushBrowser(typeof window === 'undefined' ? undefined : window);
  return {
    supported: browser.supported,
    permission: () => browser.permission(),
    requestPermission: () => browser.requestPermission(),
    subscribe: async () => {
      if (!browser.supported) return false;
      const outcome = await enableBrowserPush({
        browser,
        publicKey,
        save: (body: PushSubscriptionBody) => api.pushSubscriptionsUpsert({ body }),
      });
      return outcome.state === 'subscribed';
    },
  };
}
