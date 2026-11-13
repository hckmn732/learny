// Idempotent master-key rotation of personal AI keys (SPEC-505 ET-4, ADR-0154 point 2).
// Rows are re-encrypted in batches of 100 inside their own transaction: an interruption loses no
// row, and a second run finishes the work (CL-3). Only counts and credential identifiers are
// reported; no key, ciphertext or plaintext ever leaves this module.
import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { AppError } from '@learny/core';
import { aiCredentials, type Db } from '@learny/db';

import {
  credentialAad,
  decryptSecret,
  encryptSecret,
  keyFingerprint,
  type Keyring,
} from './crypto';

export const ROTATION_BATCH_SIZE = 100;

export interface RotationReport {
  /** Rows with a ciphertext, including those that failed. */
  total: number;
  rotated: number;
  upToDate: number;
  /** Credential identifiers only, never a ciphertext or a key. */
  failed: string[];
}

export interface RotationOptions {
  batchSize?: number;
  /** Test hook called after each committed batch; throwing simulates an interruption. */
  onBatch?: (batchIndex: number, size: number) => void;
}

/**
 * Re-encrypts every row whose ciphertext still uses the previous key. A row already readable with
 * the current key is left untouched, which makes the command safe to relaunch at any time.
 */
export async function rotateCredentialKeys(
  db: Db,
  ring: Keyring,
  options: RotationOptions = {},
): Promise<RotationReport> {
  const batchSize = options.batchSize ?? ROTATION_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error('batchSize doit être un entier entre 1 et 1000.');
  }

  const rows = await db
    .select({
      id: aiCredentials.id,
      userId: aiCredentials.userId,
      encryptedKey: aiCredentials.encryptedKey,
      qualification: aiCredentials.qualification,
    })
    .from(aiCredentials)
    .where(isNotNull(aiCredentials.encryptedKey))
    .orderBy(asc(aiCredentials.id));

  const report: RotationReport = {
    total: rows.length,
    rotated: 0,
    upToDate: 0,
    failed: [],
  };

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const touched = await db.transaction(async (tx) => {
      let rotated = 0;
      let upToDate = 0;
      const failed: string[] = [];
      for (const row of batch) {
        if (row.encryptedKey === null) {
          upToDate += 1;
          continue;
        }
        const aad = credentialAad(row.id, row.userId);
        try {
          const result = decryptSecret(Buffer.from(row.encryptedKey), aad, ring);
          if (!result.usedPrevious) {
            upToDate += 1;
            continue;
          }
          const qualification = {
            ...row.qualification,
            keyFingerprint: keyFingerprint(result.plain, ring.current),
          };
          await tx
            .update(aiCredentials)
            .set({
              encryptedKey: encryptSecret(result.plain, aad, ring.current),
              qualification,
            })
            .where(and(eq(aiCredentials.id, row.id), eq(aiCredentials.userId, row.userId)));
          rotated += 1;
        } catch (error) {
          if (error instanceof AppError && error.code === 'CREDENTIAL_DECRYPT_FAILED') {
            failed.push(row.id);
            continue;
          }
          throw error;
        }
      }
      return { rotated, upToDate, failed };
    });
    report.rotated += touched.rotated;
    report.upToDate += touched.upToDate;
    report.failed.push(...touched.failed);
    options.onBatch?.(Math.floor(start / batchSize), batch.length);
  }

  return report;
}
