// Pending verification of an e-mail (SPEC-3101 EF-3, BR-ACC-03; BR-PLA-05).
//
// The address typed before the session exists is the only data the application keeps, and it is
// kept in memory only: nothing is written to the encrypted store before the sign-in
// (BR-PLA-05), and the verification screen is reachable again through its `email` parameter.
export type PendingKind = 'signup' | 'magic_link';

export interface PendingVerification {
  readonly email: string;
  readonly kind: PendingKind;
}

let pending: PendingVerification | null = null;

/** Remembers the address and the kind of link that was just requested. */
export function rememberPendingVerification(email: string, kind: PendingKind): void {
  const address = email.trim();
  pending = address === '' ? null : { email: address, kind };
}

/** Address waiting for its link, or `null` (EF-3). */
export function pendingVerification(): PendingVerification | null {
  return pending;
}

/** Forgets the pending address, e.g. once the link opened a session (EF-7). */
export function clearPendingVerification(): void {
  pending = null;
}
