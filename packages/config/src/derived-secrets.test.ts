// ADR-4007: the web derives the same internal secrets as the Python backend.
import { createECDH } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  apiProxySecretFromEnv,
  deriveApiProxySecret,
  deriveEmailLinkSecret,
  deriveVapidPrivateKey,
  deriveVapidPublicKey,
  vapidPublicKeyFromEnv,
} from './derived-secrets';

import * as publicConfig from './index';

// Cross-language vectors: `python/learny/tests/unit/shared/test_environment_contract.py` asserts
// the same values for the same master key.
const MASTER_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const API_PROXY_SECRET = '75f53c11c2c358025613ab3c5b34ad3ae93ca6f18c529caf8f8b7dd5405c8bbe'; // learny-test-only
const EMAIL_LINK_SECRET = '9f68ff917946afc69624718d7c7fd6598eb3f8a7e47b587d6ac7528e2cd494c3'; // learny-test-only
const VAPID_PRIVATE_KEY = 'BnerRr0ndj7dqrZK5kYg5LuIW7ZZ-LIGDrgcsrooP-s';
const VAPID_PUBLIC_KEY =
  'BNPt1zs7M-gROSNgpvuQ8eQjO6iaC2fe5CQsP5YskHe6jeue24D_XOMwKNbDPFGkIuftiFgp-doefGZt9f8Ntf0';

describe('[SPEC-009] derived secrets (ADR-4007)', () => {
  it('matches the cross-language vectors of the Python backend', () => {
    expect(deriveApiProxySecret(MASTER_KEY)).toBe(API_PROXY_SECRET);
    expect(deriveEmailLinkSecret(MASTER_KEY)).toBe(EMAIL_LINK_SECRET);
    expect(deriveVapidPrivateKey(MASTER_KEY)).toBe(VAPID_PRIVATE_KEY);
    expect(deriveVapidPublicKey(MASTER_KEY)).toBe(VAPID_PUBLIC_KEY);
  });

  it('ignores the surrounding spaces of the variable', () => {
    expect(deriveApiProxySecret(`  ${MASTER_KEY}  `)).toBe(API_PROXY_SECRET);
  });

  it('always yields a valid P-256 key pair', () => {
    for (let index = 0; index < 32; index += 1) {
      const master = `master-${String(index)}`;
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(deriveVapidPrivateKey(master), 'base64url'));
      expect(ecdh.getPublicKey().toString('base64url')).toBe(deriveVapidPublicKey(master));
    }
  });

  it('reads the master key of the environment and derives nothing without it', () => {
    expect(apiProxySecretFromEnv({ APP_ENCRYPTION_KEY: MASTER_KEY })).toBe(API_PROXY_SECRET);
    expect(vapidPublicKeyFromEnv({ APP_ENCRYPTION_KEY: MASTER_KEY })).toBe(VAPID_PUBLIC_KEY);
    expect(apiProxySecretFromEnv({})).toBeUndefined();
    expect(vapidPublicKeyFromEnv({ APP_ENCRYPTION_KEY: ' ' })).toBeUndefined();
  });

  it('is never exported by the public package root', () => {
    const exported = Object.keys(publicConfig);
    for (const name of ['deriveApiProxySecret', 'apiProxySecretFromEnv', 'vapidPublicKeyFromEnv']) {
      expect(exported).not.toContain(name);
    }
  });
});
