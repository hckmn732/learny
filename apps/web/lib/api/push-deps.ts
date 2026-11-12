// Production wiring of the push channel (SPEC-205 ET-2, CL-8): the transport is built once per
// process from the validated server configuration. The VAPID private key is read here, on the
// server, and handed to the transport; it never reaches a client component or the service worker.
import { clock } from '@learny/core';
import { createPushTransport, type PushDeps } from '@learny/notifications/push';

import { getServerEnv } from '../server-env';

let cached: PushDeps | undefined;

export function pushDeps(): PushDeps {
  if (cached !== undefined) return cached;
  const env = getServerEnv();
  cached = {
    transport: createPushTransport({
      mode: env.PUSH_MODE,
      vapid: {
        subject: env.VAPID_SUBJECT,
        publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
      ci: process.env.CI,
      now: () => clock.now(),
    }),
  };
  return cached;
}

/** Test helper: forget the memoised transport between two configurations. */
export function resetPushDeps(): void {
  cached = undefined;
}
