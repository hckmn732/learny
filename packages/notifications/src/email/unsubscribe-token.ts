// One-click unsubscribe token (SPEC-204 ET-4, ADR-0124):
// `base64url(userId) + '.' + base64url(HMAC-SHA256(EMAIL_LINK_SECRET, 'unsubscribe:v1:' + userId))`,
// without expiry, verified in constant time.
import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'unsubscribe:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(secret: string, userId: string): Buffer {
  return createHmac('sha256', secret).update(`${PREFIX}${userId}`).digest();
}

export function createUnsubscribeToken(secret: string, userId: string): string {
  if (!UUID.test(userId)) throw new Error('Identifiant utilisateur invalide pour le jeton.');
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${signature(secret, userId).toString('base64url')}`;
}

/** The user identifier carried by a valid token, `null` otherwise (never throws). */
export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  if (typeof token !== 'string' || token.length > 256) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const userId = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  if (!UUID.test(userId)) return null;
  const expected = signature(secret, userId);
  let given = Buffer.from(token.slice(dot + 1), 'base64url');
  // A wrong length is compared against a same-size buffer so the time does not reveal it.
  if (given.length !== expected.length) given = Buffer.alloc(expected.length);
  return timingSafeEqual(given, expected) ? userId : null;
}
