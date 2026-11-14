import { describe, expect, it } from 'vitest';

import { PUSH_ENDPOINT_MAX_LENGTH, isPublicPushEndpoint } from './push';

describe('[SPEC-205] isPublicPushEndpoint', () => {
  it('accepte un point d’accès HTTPS public', () => {
    expect(isPublicPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPublicPushEndpoint('https://push.mock.learny.test/x/success')).toBe(true);
  });

  it.each([
    ['trop long', `https://example.com/${'a'.repeat(PUSH_ENDPOINT_MAX_LENGTH)}`],
    ['espace', 'https://example.com/a b'],
    ['antislash', 'https://example.com/a\\b'],
    ['URL invalide', 'not a url'],
    ['http', 'http://example.com/a'],
    ['identifiants', 'https://user:pw@example.com/a'],
    ['localhost', 'https://localhost/a'],
    ['IPv6', 'https://[::1]/a'],
    ['IPv4', 'https://127.0.0.1/a'],
    ['sans point', 'https://intranet/a'],
    ['point final', 'https://example.com./a'],
    ['suffixe local', 'https://push.internal/a'],
    ['home.arpa', 'https://box.home.arpa/a'],
  ])('refuse %s', (_label, value) => {
    expect(isPublicPushEndpoint(value)).toBe(false);
  });
});
