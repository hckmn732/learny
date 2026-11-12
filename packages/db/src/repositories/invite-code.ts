// Invitation-code generation (SPEC-111 ET-2, EF-1, CL-2).
//
// The code is `LRN-` followed by four characters drawn from `A-Z2-9` (34 symbols, no `0`, `1`).
// The draw uses `crypto.randomBytes` with rejection sampling so every symbol is equally likely; the
// code is never derived from a sequential identifier. Callers can inject the random source, which
// keeps the unit tests deterministic (ET-2), and the repository retries on a uniqueness violation
// inside a savepoint (CL-2).
import { randomBytes } from 'node:crypto';

import { AppError } from '@learny/core';

import { GROUP_INVITE_CODE_PATTERN } from '../schema/groups';

/** ET-2 — unambiguous alphabet: `A-Z` and the digits `2` to `9`, exactly 34 symbols. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';

/** ET-2 — returns an integer in `[0, maxExclusive)`. */
export type RandomIndexSource = (maxExclusive: number) => number;

/**
 * ET-2 — cryptographic source. A byte is rejected when it falls in the incomplete final block of
 * `256 % alphabetSize`, so the modulo introduces no bias; the loop is the textbook rejection
 * sampling, not a fixed-size shortcut.
 */
export const cryptoRandomIndex: RandomIndexSource = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 256) {
    throw new AppError('VALIDATION_FAILED', 'La source aléatoire exige une borne entre 1 et 256.');
  }
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  for (;;) {
    const [byte] = randomBytes(1);
    if (byte === undefined) continue;
    if (byte < limit) return byte % maxExclusive;
  }
};

/** ET-2 — draws four symbols from `INVITE_CODE_ALPHABET`; the prefix is fixed. */
export function generateInviteCode(random: RandomIndexSource = cryptoRandomIndex): string {
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    const position = random(INVITE_CODE_ALPHABET.length);
    if (!Number.isInteger(position) || position < 0 || position >= INVITE_CODE_ALPHABET.length) {
      throw new AppError(
        'VALIDATION_FAILED',
        `La source aléatoire a renvoyé une position invalide (${String(position)}).`,
      );
    }
    const character = INVITE_CODE_ALPHABET[position];
    if (character === undefined) {
      throw new AppError('VALIDATION_FAILED', 'La source aléatoire a renvoyé un symbole absent.');
    }
    suffix += character;
  }
  return `LRN-${suffix}`;
}

/** EF-1 — a syntactically valid invitation code. */
export function isInviteCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    GROUP_INVITE_CODE_PATTERN.test(value) &&
    value
      .slice(4)
      .split('')
      .every((character) => INVITE_CODE_ALPHABET.includes(character))
  );
}

/** EF-1, CL-3 — normalises user input (trim + upper case) before validating it. */
export function parseInviteCode(value: unknown): string {
  const normalised = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!isInviteCode(normalised)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Le code d’invitation doit respecter le format LRN-XXXX.',
      {
        errors: [{ path: 'inviteCode', message: 'format LRN-XXXX attendu' }],
      },
    );
  }
  return normalised;
}
