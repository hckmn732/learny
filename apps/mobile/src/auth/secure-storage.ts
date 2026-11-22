// Encrypted storage of the Supabase session (SPEC-3003 ET-1, EF-1, CA-5; ADR-3008 § 2).
//
// The session (access token, refresh token, user) is written into an MMKV instance whose 32-byte
// encryption key lives in the platform keychain (`expo-secure-store`): no session value is ever
// stored in clear, and the keychain never receives anything but the key (a serialised Supabase
// session is larger than the ~2 KB a keychain entry accepts).
//
// This module is pure on purpose: the native modules arrive through `SessionStorageBackend`, so
// the Vitest suite (Node) proves the encryption contract without a native runtime, and the Jest
// suite stubs the two native modules (see `test/mocks/`).
export interface KeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
  /** Wipes every entry of the store (sign-out); optional, MMKV provides it. */
  clearAll?(): void | Promise<void>;
}

/** The keychain: it only ever holds the encryption key of the store (ET-1). */
export interface SecureKeyStore {
  readKey(): Promise<string | null>;
  writeKey(key: string): Promise<void>;
}

export interface SessionStorageBackend {
  readonly keyStore: SecureKeyStore;
  /** Opens the encrypted store for `encryptionKey` (MMKV, AES-256 in the native backend). */
  readonly openEncryptedStore: (encryptionKey: string) => KeyValueStore;
  /** 64 hexadecimal characters, i.e. 32 random bytes (`expo-crypto`, ET-1). */
  readonly generateKey: () => string;
}

/** 32 random bytes, hexadecimal. */
export const ENCRYPTION_KEY_HEX_LENGTH = 64;

/** Key of the Supabase session inside the encrypted store. */
export const SESSION_STORAGE_KEY = 'learny.session.v1';

const HEX_KEY = /^[0-9a-f]{64}$/i;

/** True for a 32-byte key written in hexadecimal: the only shape accepted from the keychain. */
export function isValidEncryptionKey(value: string): boolean {
  return HEX_KEY.test(value);
}

/** Subset of the Supabase storage interface used by the client (`getItem`/`setItem`/`removeItem`). */
export interface SecureSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Empties the encrypted store (sign-out, EF-6). */
  clear(): Promise<void>;
}

/**
 * Builds the session storage on top of an injected backend (ET-1).
 *
 * - the encryption key is read from the keychain, and generated exactly once when absent or
 *   malformed (a corrupted keychain entry never yields a clear-text write);
 * - the encrypted store is opened lazily and cached for the process lifetime;
 * - an unreadable keychain (CL-6, iOS device locked at start-up) returns `null` instead of
 *   throwing, so the application starts signed out and retries at the first foreground.
 */
export function createSecureSessionStorage(
  backend: SessionStorageBackend,
): SecureSessionStorage {
  let opened: KeyValueStore | undefined;
  let encryptionKey: string | undefined;

  async function store(): Promise<KeyValueStore> {
    if (opened !== undefined) return opened;
    const read = encryptionKey ?? (await backend.keyStore.readKey());
    let key: string;
    if (read !== null && isValidEncryptionKey(read)) {
      key = read;
    } else {
      key = backend.generateKey();
      if (!isValidEncryptionKey(key)) {
        throw new Error('Clé de chiffrement invalide : 32 octets aléatoires attendus.');
      }
      await backend.keyStore.writeKey(key);
    }
    encryptionKey = key;
    opened = backend.openEncryptedStore(key);
    return opened;
  }

  return {
    async getItem(key) {
      try {
        const value = await (await store()).getItem(key);
        return value ?? null;
      } catch {
        // CL-6 — a keychain or store failure is not fatal: the session is simply absent, the
        // next call re-opens the store (first foreground after an unlock).
        opened = undefined;
        return null;
      }
    },
    async setItem(key, value) {
      await (await store()).setItem(key, value);
    },
    async removeItem(key) {
      await (await store()).removeItem(key);
    },
    async clear() {
      const target = await store();
      if (target.clearAll !== undefined) {
        await target.clearAll();
        return;
      }
      await target.removeItem(SESSION_STORAGE_KEY);
    },
  };
}
