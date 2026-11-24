// Vitest [SPEC-3402] — nonce du flux Apple (EF-2).
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createNonce, hashNonce, NONCE_BYTES } from './nonce';

describe('[SPEC-3402] nonce Apple', () => {
  it('produit seize octets aléatoires en hexadécimal (EF-2)', () => {
    const nonce = createNonce(() => new Uint8Array(NONCE_BYTES).fill(0xab));
    expect(nonce).toBe('ab'.repeat(NONCE_BYTES));
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('transmet à Apple une empreinte SHA-256 en minuscules (EF-2)', async () => {
    const digest = (value: string): Promise<string> =>
      Promise.resolve(createHash('sha256').update(value).digest('hex').toUpperCase());
    await expect(hashNonce('nonce-de-test', digest)).resolves.toBe(
      createHash('sha256').update('nonce-de-test').digest('hex'),
    );
  });

  it('refuse un nonce vide et une empreinte non hexadécimale', async () => {
    expect(() => createNonce(() => new Uint8Array())).toThrow(/nonce/i);
    await expect(hashNonce('', () => Promise.resolve('00'))).rejects.toThrow(/nonce/i);
    await expect(hashNonce('abc', () => Promise.resolve('zz'))).rejects.toThrow(/hexadécimale/);
  });
});
