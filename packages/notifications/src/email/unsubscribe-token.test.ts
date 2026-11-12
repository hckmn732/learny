// One-click unsubscribe token (SPEC-204 ET-4, ADR-0124): round-trip, any alteration rejected,
// another secret cannot forge a link, verification never throws.
import { describe, expect, it } from 'vitest';

import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'learny-test-only-email-link-secret-000000';
const OTHER_SECRET = 'learny-test-only-email-link-secret-111111';
const USER_ID = '3f9a2f0e-1c4b-4c5d-8e9f-0a1b2c3d4e5f';
const OTHER_USER = '4a8b3f1e-2d5c-4d6e-9f0a-1b2c3d4e5f60';

describe('[SPEC-204] jeton de désinscription', () => {
  it('CA-4 — l’aller-retour rend l’identifiant signé', () => {
    const token = createUnsubscribeToken(SECRET, USER_ID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyUnsubscribeToken(SECRET, token)).toBe(USER_ID);
    expect(verifyUnsubscribeToken(SECRET, createUnsubscribeToken(SECRET, OTHER_USER))).toBe(
      OTHER_USER,
    );
  });

  it('CA-4 / CL-5 — un jeton altéré d’un caractère est refusé', () => {
    const token = createUnsubscribeToken(SECRET, USER_ID);
    const [payload = '', signature = ''] = token.split('.');
    const alteredSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyUnsubscribeToken(SECRET, `${payload}.${alteredSignature}`)).toBeNull();

    const alteredPayload = createUnsubscribeToken(SECRET, OTHER_USER).split('.')[0] ?? '';
    expect(verifyUnsubscribeToken(SECRET, `${alteredPayload}.${signature}`)).toBeNull();
  });

  it('CL-5 — un jeton forgé avec un autre secret est refusé', () => {
    const forged = createUnsubscribeToken(OTHER_SECRET, USER_ID);
    expect(verifyUnsubscribeToken(SECRET, forged)).toBeNull();
  });

  it('refuse les jetons malformés sans lever', () => {
    for (const token of [
      '',
      '.',
      'abc',
      'abc.',
      '.abc',
      `${Buffer.from('pas-un-uuid').toString('base64url')}.abc`,
      'x'.repeat(257),
      'a.b.c',
    ]) {
      expect(verifyUnsubscribeToken(SECRET, token), token).toBeNull();
    }
  });

  it('refuse un identifiant qui n’est pas un UUID à la création', () => {
    expect(() => createUnsubscribeToken(SECRET, 'pas-un-uuid')).toThrow();
  });
});
