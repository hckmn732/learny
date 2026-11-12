import { describe, expect, it } from 'vitest';

import {
  RATE_PROFILES,
  bucketKey,
  hashIp,
  refilledTokens,
  retryAfterSeconds,
  UNKNOWN_IP,
} from './rate-limit';

const SECRET = 'x'.repeat(40);
const USER = '4b7c1c8e-6a0f-4d52-9d3e-6f9d1f0a1b11';

describe('[SPEC-208] seau à jetons', () => {
  it('declares the profiles of ADR-0213', () => {
    expect(RATE_PROFILES.default).toEqual({ capacity: 120, refillPerSecond: 2, key: 'user' });
    expect(RATE_PROFILES.ai.capacity).toBe(20);
    expect(RATE_PROFILES.ai.refillPerSecond).toBeCloseTo(1 / 3, 10);
    expect(RATE_PROFILES.ai.key).toBe('user');
    expect(RATE_PROFILES.auth.capacity).toBe(10);
    expect(RATE_PROFILES.auth.refillPerSecond).toBeCloseTo(1 / 6, 10);
    expect(RATE_PROFILES.auth.key).toBe('ip');
  });

  it('refills linearly and never above the capacity (CL-2)', () => {
    const spec = RATE_PROFILES.default;
    expect(refilledTokens(spec, 0, 30)).toBe(60);
    expect(refilledTokens(spec, 0, 1)).toBe(2);
    expect(refilledTokens(spec, 100, 30)).toBe(120);
    expect(refilledTokens(spec, 0, 3600)).toBe(120);
    expect(refilledTokens(spec, 5, 0)).toBe(5);
  });

  it('ignores a clock that went backwards', () => {
    expect(refilledTokens(RATE_PROFILES.default, 7, -50)).toBe(7);
  });

  it.each([
    ['default', 0, 1],
    ['default', 0.4, 1],
    ['ai', 0, 3],
    ['ai', 0.5, 2],
    ['auth', 0, 6],
    ['auth', 0.5, 3],
    ['auth', 0.999, 1],
  ] as const)('Retry-After of %s with %f token is %i s (EF-2)', (profile, tokens, seconds) => {
    expect(retryAfterSeconds(RATE_PROFILES[profile], tokens)).toBe(seconds);
  });

  it('hashes an address with a secret: 32 hexadecimal characters, no address in clear (CA-5)', () => {
    const hash = hashIp(SECRET, '203.0.113.9');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toBe(hashIp(SECRET, '203.0.113.9'));
    expect(hash).not.toBe(hashIp(SECRET, '203.0.113.10'));
    expect(hash).not.toBe(hashIp('y'.repeat(40), '203.0.113.9'));
    expect(hash).not.toContain('203');
  });

  it('keys a bucket by learner or by address (ET-3, CL-4)', () => {
    expect(bucketKey('default', { userId: USER, ip: '203.0.113.9' }, SECRET)).toBe(
      `user:${USER}:default`,
    );
    expect(bucketKey('ai', { userId: USER, ip: null }, SECRET)).toBe(`user:${USER}:ai`);
    // The authentication profile is per address even for a signed-in learner.
    expect(bucketKey('auth', { userId: USER, ip: '203.0.113.9' }, SECRET)).toBe(
      `ip:${hashIp(SECRET, '203.0.113.9')}:auth`,
    );
  });

  it('falls back to the address for a public route and to the shared bucket without address', () => {
    expect(bucketKey('default', { userId: null, ip: '203.0.113.9' }, SECRET)).toBe(
      `ip:${hashIp(SECRET, '203.0.113.9')}:default`,
    );
    expect(bucketKey('auth', { userId: null, ip: null }, SECRET)).toBe(`ip:${UNKNOWN_IP}:auth`);
    expect(bucketKey('auth', { userId: null, ip: '' }, SECRET)).toBe('ip:unknown:auth');
  });

  it('keeps one bucket per profile for the same learner (EF-4)', () => {
    const keys = (['default', 'ai'] as const).map((profile) =>
      bucketKey(profile, { userId: USER, ip: null }, SECRET),
    );
    expect(new Set(keys).size).toBe(2);
  });
});
