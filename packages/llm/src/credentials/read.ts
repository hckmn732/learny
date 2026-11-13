// Server-side read of one personal key (SPEC-505 ET-3). Not exported by the package entry point or
// by the `credentials` subpath: only `@learny/llm` decrypts a key, immediately before a provider
// call. A key decrypted with the previous master key is re-encrypted at once (lazy rotation, CL-3).
import { and, eq } from 'drizzle-orm';

import { AppError, err, ok, type Result } from '@learny/core';
import { aiCredentials, type Db } from '@learny/db';

import {
  credentialAad,
  decryptSecret,
  encryptSecret,
  keyFingerprint,
  loadKeyring,
  type Keyring,
} from './crypto';

export interface ReadCredentialInput {
  userId: string;
  credentialId: string;
}

export interface ReadCredentialOptions {
  /** Test seam of the rotation; production reads the process environment. */
  ring?: Keyring;
  env?: Readonly<Record<string, string | undefined>>;
}

function decryptFailed(): AppError {
  return new AppError(
    'CREDENTIAL_DECRYPT_FAILED',
    'La clé enregistrée n’a pas pu être déchiffrée. Supprimez-la puis enregistrez-la à nouveau.',
    { status: 500 },
  );
}

/**
 * Returns the plaintext key of one owned credential, or `null` for a keyless local model. A missing
 * row, a null ciphertext on a hosted provider, a wrong AAD or a wrong keyring all fail with
 * `CREDENTIAL_DECRYPT_FAILED`; the error never contains the ciphertext or the key.
 */
export async function decryptCredentialKey(
  db: Db,
  input: ReadCredentialInput,
  options: ReadCredentialOptions = {},
): Promise<Result<string | null>> {
  const rows = await db
    .select({
      provider: aiCredentials.provider,
      encryptedKey: aiCredentials.encryptedKey,
      qualification: aiCredentials.qualification,
    })
    .from(aiCredentials)
    .where(and(eq(aiCredentials.id, input.credentialId), eq(aiCredentials.userId, input.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return err(decryptFailed());

  if (row.encryptedKey === null) {
    return row.provider === 'local' ? ok(null) : err(decryptFailed());
  }

  const ring = options.ring ?? loadKeyring(options.env ?? process.env);
  const aad = credentialAad(input.credentialId, input.userId);
  let decrypted: { plain: string; usedPrevious: boolean };
  try {
    decrypted = decryptSecret(Buffer.from(row.encryptedKey), aad, ring);
  } catch (error) {
    return err(
      error instanceof AppError && error.code === 'CREDENTIAL_DECRYPT_FAILED'
        ? error
        : decryptFailed(),
    );
  }

  if (decrypted.usedPrevious) {
    // Lazy rotation: any read completes the migration of this row. A write failure does not
    // withhold a valid key from the current call; the rotation script will retry the row.
    try {
      const qualification = {
        ...row.qualification,
        keyFingerprint: keyFingerprint(decrypted.plain, ring.current),
      };
      await db
        .update(aiCredentials)
        .set({
          encryptedKey: encryptSecret(decrypted.plain, aad, ring.current),
          qualification,
        })
        .where(
          and(eq(aiCredentials.id, input.credentialId), eq(aiCredentials.userId, input.userId)),
        );
    } catch {
      // best effort; never log the key or the ciphertext
    }
  }

  return ok(decrypted.plain);
}
