// Vitest [SPEC-3003] — encrypted session storage (ET-1, CA-5, CL-6).
//
// The MMKV instance is simulated by a store that only accepts ciphered text, keyed by the
// encryption key: the test then proves two things at once — the adapter always writes through the
// store opened with the keychain key, and no session value ever appears in clear in the keychain
// nor in the raw bytes of the store (CA-5).
import { describe, expect, it } from 'vitest';

import {
  createSecureSessionStorage,
  ENCRYPTION_KEY_HEX_LENGTH,
  isValidEncryptionKey,
  SESSION_STORAGE_KEY,
  type KeyValueStore,
  type SessionStorageBackend,
} from './secure-storage';

const SESSION = JSON.stringify({
  access_token: 'access-token-en-clair-interdit',
  refresh_token: 'refresh-token-en-clair-interdit',
  user: { id: 'u-alex', email: 'alex.perrin@demo.learny.test' },
});

const HEX = '0123456789abcdef';
const KEY_A = 'a1'.repeat(32);
const KEY_B = 'b2'.repeat(32);

/** Reversible stand-in of the AES-256 of MMKV: the raw map never holds a clear string. */
function cipher(plain: string, key: string): string {
  const bytes = new TextEncoder().encode(plain);
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const offset = (index * 2) % key.length;
    const mask = parseInt(key.slice(offset, offset + 2), 16);
    out += ((bytes[index] ?? 0) ^ mask).toString(16).padStart(2, '0');
  }
  return out;
}

function decipher(stored: string, key: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < stored.length; index += 2) {
    const offset = ((index / 2) * 2) % key.length;
    const mask = parseInt(key.slice(offset, offset + 2), 16);
    bytes.push(parseInt(stored.slice(index, index + 2), 16) ^ mask);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

interface Harness {
  backend: SessionStorageBackend;
  keychain: string[];
  raw: Map<string, string>;
  opened: string[];
  setKeychainFailure(failing: boolean): void;
}

function harness(initialKey?: string): Harness {
  const keychain: string[] = initialKey === undefined ? [] : [initialKey];
  const raw = new Map<string, string>();
  const opened: string[] = [];
  let failing = false;

  const backend: SessionStorageBackend = {
    keyStore: {
      readKey: () =>
        failing ? Promise.reject(new Error('keychain indisponible')) : Promise.resolve(keychain[0] ?? null),
      writeKey: (key) => {
        keychain[0] = key;
        return Promise.resolve();
      },
    },
    openEncryptedStore(encryptionKey) {
      opened.push(encryptionKey);
      const store: KeyValueStore = {
        getItem: (key) => {
          const stored = raw.get(`${encryptionKey}:${key}`);
          return stored === undefined ? null : decipher(stored, encryptionKey);
        },
        setItem: (key, value) => {
          raw.set(`${encryptionKey}:${key}`, cipher(value, encryptionKey));
        },
        removeItem: (key) => {
          raw.delete(`${encryptionKey}:${key}`);
        },
        clearAll: () => {
          for (const entry of [...raw.keys()]) {
            if (entry.startsWith(`${encryptionKey}:`)) raw.delete(entry);
          }
        },
      };
      return store;
    },
    generateKey: () => KEY_A,
  };

  return {
    backend,
    keychain,
    raw,
    opened,
    setKeychainFailure(value: boolean) {
      failing = value;
    },
  };
}

describe('[SPEC-3003] stockage chiffré de la session (ET-1, CA-5)', () => {
  it('génère une clé de 32 octets au premier lancement et la garde dans le trousseau', async () => {
    const test = harness();
    const storage = createSecureSessionStorage(test.backend);

    await storage.setItem(SESSION_STORAGE_KEY, SESSION);

    expect(test.keychain).toHaveLength(1);
    const stored = test.keychain[0] ?? '';
    expect(stored).toHaveLength(ENCRYPTION_KEY_HEX_LENGTH);
    expect(isValidEncryptionKey(stored)).toBe(true);
    expect(stored).toBe(KEY_A);
    expect(test.opened).toEqual([KEY_A]);
  });

  it('n’écrit aucune valeur de session en clair, ni dans le trousseau ni dans le magasin (CA-5)', async () => {
    const test = harness();
    const storage = createSecureSessionStorage(test.backend);

    await storage.setItem(SESSION_STORAGE_KEY, SESSION);

    // The keychain only ever receives the key, never the session.
    expect(test.keychain.join('|')).not.toContain('access-token-en-clair-interdit');
    expect(test.keychain.join('|')).not.toContain('refresh-token-en-clair-interdit');
    // The raw bytes of the encrypted store hold no readable value.
    const raw = [...test.raw.values()].join('|').toLowerCase();
    expect(raw).not.toContain('access-token-en-clair-interdit');
    expect(raw).not.toContain('refresh-token-en-clair-interdit');
    expect(raw).not.toContain('alex.perrin');
    for (const byte of raw) expect(HEX).toContain(byte);
    // And the round-trip still gives the exact session back.
    expect(await storage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION);
  });

  it('réutilise la clé du trousseau au lieu d’en créer une autre (ET-1)', async () => {
    const test = harness(KEY_B);
    const storage = createSecureSessionStorage(test.backend);

    await storage.setItem(SESSION_STORAGE_KEY, SESSION);

    expect(test.keychain).toEqual([KEY_B]);
    expect(test.opened).toEqual([KEY_B]);
  });

  it('remplace une clé de trousseau corrompue par une clé neuve (ET-1)', async () => {
    const test = harness('clé-tronquée');
    const storage = createSecureSessionStorage(test.backend);

    await storage.setItem(SESSION_STORAGE_KEY, SESSION);

    expect(test.keychain).toEqual([KEY_A]);
    expect(test.opened).toEqual([KEY_A]);
    // The previous entry, unreadable, was not reused: nothing was written in clear.
    expect([...test.raw.values()].join('')).not.toContain('access-token');
  });

  it('retourne null quand le trousseau est inaccessible, puis réessaie (CL-6)', async () => {
    const test = harness(KEY_B);
    const storage = createSecureSessionStorage(test.backend);
    test.setKeychainFailure(true);

    await expect(storage.getItem(SESSION_STORAGE_KEY)).resolves.toBeNull();

    test.setKeychainFailure(false);
    await storage.setItem(SESSION_STORAGE_KEY, SESSION);
    await expect(storage.getItem(SESSION_STORAGE_KEY)).resolves.toBe(SESSION);
  });

  it('vide le magasin chiffré à la déconnexion (EF-6)', async () => {
    const test = harness();
    const storage = createSecureSessionStorage(test.backend);
    await storage.setItem(SESSION_STORAGE_KEY, SESSION);

    await storage.clear();

    expect(test.raw.size).toBe(0);
    await expect(storage.getItem(SESSION_STORAGE_KEY)).resolves.toBeNull();
  });

  it('n’accepte que des clés hexadécimales de 32 octets', () => {
    expect(isValidEncryptionKey(KEY_A)).toBe(true);
    expect(isValidEncryptionKey(KEY_A.toUpperCase())).toBe(true);
    expect(isValidEncryptionKey('abc')).toBe(false);
    expect(isValidEncryptionKey(`${KEY_A}00`)).toBe(false);
    expect(isValidEncryptionKey('zz'.repeat(32))).toBe(false);
    expect(isValidEncryptionKey('')).toBe(false);
  });
});
