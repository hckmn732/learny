// Integration tests of the encryption, server-side read and rotation (SPEC-505 CA-1, CA-2, CL-2,
// CL-3). Postgres is real; the master keys are deterministic test keys. Only counts and identifiers
// are written to the rotation report, never a key or a ciphertext.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, aiCredentials, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  credentialAad,
  decryptSecret,
  encryptSecret,
  keyFingerprint,
  loadKeyring,
  type Keyring,
} from '../../src/credentials/crypto';
import { decryptCredentialKey } from '../../src/credentials/read';
import { rotateCredentialKeys } from '../../src/credentials/rotate';

const PREFIX = 'sdd-505-crypto-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const OLD = Buffer.alloc(32, 0x11);
const NEW = Buffer.alloc(32, 0x22);
const OLD_RING: Keyring = { current: OLD, previous: null };
const NEW_RING: Keyring = { current: NEW, previous: OLD };
const NEW_ONLY: Keyring = { current: NEW, previous: null };

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

interface SeedOptions {
  userId: string;
  secret: string | null;
  ring?: Keyring;
  provider?: 'openai' | 'local';
}

async function seedCredential(options: SeedOptions): Promise<string> {
  const id = randomUUID();
  const userId = options.userId;
  const ring = options.ring ?? OLD_RING;
  const secret = options.secret;
  const aad = credentialAad(id, userId);
  await serviceDb()
    .insert(aiCredentials)
    .values({
      id,
      userId,
      provider: options.provider ?? 'openai',
      label: `Clé ${id.slice(0, 8)}`,
      baseUrl: options.provider === 'local' ? 'http://localhost:11434' : null,
      modelIds: ['test-model'],
      encryptedKey: secret === null ? null : encryptSecret(secret, aad, ring.current),
      keyLast4: secret === null ? null : secret.slice(-4),
      status: 'untested',
      qualification:
        secret === null
          ? {}
          : { keyFingerprint: keyFingerprint(secret, ring.current), keyPrefix: 'sk' },
      outsideEu: false,
      qualifiedAt: null,
      createdAt: FIXED,
      updatedAt: FIXED,
    });
  return id;
}

async function ciphertextOf(id: string): Promise<Buffer> {
  const rows = await serviceDb()
    .select({ encryptedKey: aiCredentials.encryptedKey })
    .from(aiCredentials)
    .where(sql`${aiCredentials.id} = ${id}::uuid`);
  const value = rows[0]?.encryptedKey;
  if (value === undefined || value === null) throw new Error('chiffré absent');
  return Buffer.from(value);
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-505] chiffrement, lecture serveur et rotation', () => {
  it('ET-3 — lit une clé, puis rechiffre une ligne lue avec la clé précédente', async () => {
    const userId = await createUser('read');
    const secret = 'sk-test-read-00000000a91F'; // learny-test-only
    const id = await seedCredential({ userId, secret });
    const before = await ciphertextOf(id);

    const read = await decryptCredentialKey(
      serviceDb(),
      { userId, credentialId: id },
      { ring: NEW_RING },
    );
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(secret);

    const after = await ciphertextOf(id);
    expect(after.equals(before)).toBe(false);
    expect(decryptSecret(after, credentialAad(id, userId), NEW_ONLY).plain).toBe(secret);
    const rows = await serviceDb()
      .select({ qualification: aiCredentials.qualification })
      .from(aiCredentials)
      .where(sql`${aiCredentials.id} = ${id}::uuid`);
    expect(rows[0]?.qualification.keyFingerprint).toBe(keyFingerprint(secret, NEW));
  });

  it('CL-2 — un chiffré copié sur la ligne d’un autre utilisateur est refusé', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const aliceId = await seedCredential({ userId: alice, secret: 'sk-test-alice-a91F' }); // learny-test-only
    const bobId = await seedCredential({ userId: bob, secret: 'sk-test-bob-b7Kq2' }); // learny-test-only
    await serviceDb().execute(sql`
      update public.ai_credentials
      set encrypted_key = (select encrypted_key from public.ai_credentials where id = ${aliceId}::uuid)
      where id = ${bobId}::uuid
    `);

    const read = await decryptCredentialKey(
      serviceDb(),
      { userId: bob, credentialId: bobId },
      { ring: OLD_RING },
    );
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.code).toBe('CREDENTIAL_DECRYPT_FAILED');
      expect(JSON.stringify(read.error)).not.toContain('sk-test');
    }
  });

  it('ET-3 — un modèle local sans clé renvoie null, une ligne absente échoue', async () => {
    const userId = await createUser('local');
    const id = await seedCredential({ userId, secret: null, provider: 'local' });
    const local = await decryptCredentialKey(
      serviceDb(),
      { userId, credentialId: id },
      { ring: OLD_RING },
    );
    expect(local).toEqual({ ok: true, value: null });

    const missing = await decryptCredentialKey(
      serviceDb(),
      { userId, credentialId: randomUUID() },
      { ring: OLD_RING },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('CREDENTIAL_DECRYPT_FAILED');
  });

  it('CL-1 — la clé de test de @learny/testing est acceptée, 31 octets sont refusés', () => {
    const ring = loadKeyring(process.env);
    expect(ring.current.length).toBe(32);
    expect(() =>
      loadKeyring({ APP_ENCRYPTION_KEY: Buffer.alloc(31, 1).toString('base64') }),
    ).toThrow();
  });

  it('CA-2, CL-3 — rotation de 250 lignes interrompue puis reprise, sans perte', async () => {
    const userId = await createUser('rotation');
    const secrets = Array.from(
      { length: 250 },
      (_, index) => `sk-test-rotation-${String(index).padStart(6, '0')}-a91F`, // learny-test-only
    );
    await serviceDb().transaction(async (tx) => {
      for (const [index, secret] of secrets.entries()) {
        const id = randomUUID();
        await tx.insert(aiCredentials).values({
          id,
          userId,
          provider: 'openai',
          label: `Rotation ${String(index)}`,
          modelIds: ['gpt-rotation'],
          encryptedKey: encryptSecret(secret, credentialAad(id, userId), OLD),
          keyLast4: secret.slice(-4),
          status: 'untested',
          qualification: { keyFingerprint: keyFingerprint(secret, OLD), keyPrefix: 'sk' },
          outsideEu: true,
          qualifiedAt: null,
          createdAt: new Date(FIXED.getTime() + index),
          updatedAt: FIXED,
        });
      }
    });

    let interrupted = false;
    try {
      await rotateCredentialKeys(serviceDb(), NEW_RING, {
        batchSize: 100,
        onBatch: (index) => {
          if (index === 0) throw new Error('interruption simulée');
        },
      });
    } catch (error) {
      interrupted = true;
      expect((error as Error).message).toBe('interruption simulée');
    }
    expect(interrupted).toBe(true);

    const report = await rotateCredentialKeys(serviceDb(), NEW_RING, { batchSize: 100 });
    expect(report.total).toBe(250);
    expect(report.failed).toEqual([]);
    expect(report.rotated + report.upToDate).toBe(250);
    expect(report.rotated).toBeGreaterThan(0);

    const rows = await serviceDb()
      .select({
        id: aiCredentials.id,
        userId: aiCredentials.userId,
        encryptedKey: aiCredentials.encryptedKey,
        qualification: aiCredentials.qualification,
      })
      .from(aiCredentials)
      .where(sql`${aiCredentials.userId} = ${userId}::uuid`);
    expect(rows.length).toBe(250);
    for (const row of rows) {
      const plain = decryptSecret(
        Buffer.from(row.encryptedKey as Uint8Array),
        credentialAad(row.id, row.userId),
        NEW_ONLY,
      ).plain;
      expect(plain).toMatch(/^sk-test-rotation-\d{6}-a91F$/); // learny-test-only
    }

    // Real output of the rotation, kept for the evidence folder (no key, no ciphertext).
    const outputDir = path.join(process.cwd(), 'test-results', 'sdd', 'SPEC-505');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'rotation.txt'),
      [
        'Rotation des clés IA personnelles (base de test)',
        `Lignes examinées : ${String(report.total)}`,
        `Rechiffrées      : ${String(report.rotated)}`,
        `Déjà à jour      : ${String(report.upToDate)}`,
        `En échec         : ${String(report.failed.length)}`,
        'Reprise après interruption simulée : réussie, aucune ligne perdue.',
        '',
      ].join('\n'),
    );
  });
});
