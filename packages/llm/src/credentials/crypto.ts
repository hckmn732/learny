// AES-256-GCM envelope of personal AI keys (SPEC-505 ET-1, BR-IA-03, ADR-0154).
// Stored layout: iv(12) ‖ tag(16) ‖ ciphertext. The AAD binds a ciphertext to one credential row,
// so copying it onto another learner's row makes decryption fail (CL-2). Plaintext keys only ever
// live in a local variable: no function of this module logs, returns or throws a key.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { EnvConfigError, type EnvInput } from '@learny/config';
import { AppError } from '@learny/core';

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
export const AES_GCM_ENVELOPE_BYTES = AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES;
export const KEYRING_KEY_BYTES = 32;
export const MASK_BULLETS = '••••••••';

export interface Keyring {
  readonly current: Buffer;
  readonly previous: Buffer | null;
}

function decodeMasterKey(
  raw: string | undefined,
  name: 'APP_ENCRYPTION_KEY' | 'APP_ENCRYPTION_KEY_PREVIOUS',
  required: boolean,
): Buffer | null {
  if (raw === undefined || raw.trim() === '') {
    if (!required) return null;
    throw new EnvConfigError('serveur', [{ name, code: 'missing' }]);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new EnvConfigError('serveur', [{ name, code: 'invalid' }]);
  }
  const value = Buffer.from(raw, 'base64');
  if (value.length !== KEYRING_KEY_BYTES) {
    throw new EnvConfigError('serveur', [{ name, code: 'invalid' }]);
  }
  return value;
}

/**
 * Reads the master keys of the process. A 31-byte key fails here even when the general
 * environment schema was bypassed (CL-1); the error names the variable, never its value.
 */
export function loadKeyring(env: EnvInput = process.env): Keyring {
  const current = decodeMasterKey(env.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY', true);
  const previous = decodeMasterKey(
    env.APP_ENCRYPTION_KEY_PREVIOUS,
    'APP_ENCRYPTION_KEY_PREVIOUS',
    false,
  );
  // `decodeMasterKey` throws instead of returning null for a required key.
  return { current: current as Buffer, previous };
}

/** AAD binding a ciphertext to its credential row and owner (ADR-0154 point 1). */
export function credentialAad(credentialId: string, userId: string): string {
  return `learny:ai_credentials:${credentialId}:${userId}`;
}

/** Encrypts one secret. The IV is fresh on every call, so two ciphertexts differ (CA-1). */
export function encryptSecret(plain: string, aad: string, key: Buffer): Buffer {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptWith(blob: Buffer, aad: string, key: Buffer): string {
  const iv = blob.subarray(0, AES_GCM_IV_BYTES);
  const tag = blob.subarray(AES_GCM_IV_BYTES, AES_GCM_ENVELOPE_BYTES);
  const ciphertext = blob.subarray(AES_GCM_ENVELOPE_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

function decryptFailure(): AppError {
  return new AppError(
    'CREDENTIAL_DECRYPT_FAILED',
    'La clé enregistrée n’a pas pu être déchiffrée. Supprimez-la puis enregistrez-la à nouveau.',
    { status: 500 },
  );
}

/**
 * Decrypts with the current key, then with the previous one during a rotation. A tampered byte,
 * another row's AAD or the wrong keyring is reported as `CREDENTIAL_DECRYPT_FAILED` without any
 * detail about the ciphertext.
 */
export function decryptSecret(
  blob: Buffer,
  aad: string,
  ring: Keyring,
): { plain: string; usedPrevious: boolean } {
  if (!Buffer.isBuffer(blob) || blob.length < AES_GCM_ENVELOPE_BYTES) {
    throw decryptFailure();
  }
  try {
    return { plain: decryptWith(blob, aad, ring.current), usedPrevious: false };
  } catch {
    const previous = ring.previous;
    if (previous === null) throw decryptFailure();
    try {
      return { plain: decryptWith(blob, aad, previous), usedPrevious: true };
    } catch {
      throw decryptFailure();
    }
  }
}

/** HMAC-SHA256 hex of a key, stored in `qualification.keyFingerprint` for duplicate detection. */
export function keyFingerprint(plain: string, key: Buffer): string {
  return createHmac('sha256', key).update(plain, 'utf8').digest('hex');
}

/** Compares two hex fingerprints without leaking their common prefix timing. */
export function sameFingerprint(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mask shown to the learner: `sk-••••••••a91F` when the key has an alphabetic prefix,
 * `••••••••7Kq2` otherwise (CA-4). Only the last four characters are ever kept in clear.
 */
export function maskKey(last4: string, prefix = ''): string {
  const tail = last4.slice(-4);
  const clean = prefix.trim().replace(/-+$/u, '');
  return clean === '' ? `${MASK_BULLETS}${tail}` : `${clean}-${MASK_BULLETS}${tail}`;
}

/** Alphabetic prefix before the first hyphen (`sk-proj-…` → `sk`), or an empty string. */
export function keyPrefixOf(plain: string): string {
  return /^([A-Za-z]+)-/.exec(plain)?.[1] ?? '';
}

/** Last four characters of a key, the only visible fragment. */
export function keyLast4Of(plain: string): string {
  return plain.slice(-4);
}
