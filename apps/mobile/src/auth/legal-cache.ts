// Marker of the legal documents accepted through a provider (SPEC-3402 CA-2; BR-ACC-02).
//
// The API only exposes the active versions through a refusal, so a provider connection asks for
// them once and keeps a marker per account in the encrypted store. A later change of version is
// still caught by the server guard of the guarded mutations, which opens the same sheet.
import type { SecureSessionStorage } from './secure-storage';

const PREFIX = 'learny.legal.v1.';

export function legalMarkerKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

/** True when this account already accepted the documents through a provider. */
export async function hasLegalAcceptance(
  storage: SecureSessionStorage,
  userId: string,
): Promise<boolean> {
  return (await storage.getItem(legalMarkerKey(userId))) === '1';
}

/** Records the acceptance of the account (idempotent). */
export async function rememberLegalAcceptance(
  storage: SecureSessionStorage,
  userId: string,
): Promise<void> {
  await storage.setItem(legalMarkerKey(userId), '1');
}

/** Forgets the marker (tests, account deletion). */
export async function forgetLegalAcceptance(
  storage: SecureSessionStorage,
  userId: string,
): Promise<void> {
  await storage.removeItem(legalMarkerKey(userId));
}
