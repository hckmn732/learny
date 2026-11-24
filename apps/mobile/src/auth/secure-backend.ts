// Native backend of the encrypted session storage (SPEC-3003 ET-1; ADR-3008 § 2).
//
// `expo-secure-store` holds the 32-byte key (keychain / EncryptedSharedPreferences, readable after
// the first unlock); `react-native-mmkv` holds the session, encrypted with that key. This is the
// only module of the application that touches either of them.
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

import {
  createSecureSessionStorage,
  ENCRYPTION_KEY_HEX_LENGTH,
  type KeyValueStore,
  type SessionStorageBackend,
} from './secure-storage';

/** Keychain entry of the encryption key. */
export const KEYCHAIN_KEY = 'learny.session.encryption-key';

/** MMKV instance holding the session and the persisted query cache. */
export const SECURE_MMKV_ID = 'learny-secure';

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  // The session must survive a restart that happens while the device is locked (CL-6), so the
  // key is readable from the first unlock on.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** 32 random bytes from `expo-crypto`, hexadecimal (ET-1). */
export function generateEncryptionKey(): string {
  const bytes = getRandomBytes(ENCRYPTION_KEY_HEX_LENGTH / 2);
  return toHex(bytes);
}

/** The encrypted MMKV instance of this process, keyed by its encryption key. */
export function openSecureMmkv(encryptionKey: string): MMKV {
  return new MMKV({ id: SECURE_MMKV_ID, encryptionKey });
}

export const nativeSessionBackend: SessionStorageBackend = {
  keyStore: {
    async readKey() {
      try {
        return await SecureStore.getItemAsync(KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
      } catch {
        // CL-6 — keychain unavailable (device locked, backup restored without key): the caller
        // generates a new key and the previous session is simply not restored.
        return null;
      }
    },
    async writeKey(key) {
      await SecureStore.setItemAsync(KEYCHAIN_KEY, key, KEYCHAIN_OPTIONS);
    },
  },
  openEncryptedStore(encryptionKey) {
    const mmkv = openSecureMmkv(encryptionKey);
    const store: KeyValueStore = {
      getItem: (key) => mmkv.getString(key) ?? null,
      setItem: (key, value) => {
        mmkv.set(key, value);
      },
      removeItem: (key) => {
        mmkv.delete(key);
      },
      clearAll: () => {
        mmkv.clearAll();
      },
    };
    return store;
  },
  generateKey: generateEncryptionKey,
};

/** Session storage of the application (Supabase `auth.storage`, ET-1). */
export const secureSessionStorage = createSecureSessionStorage(nativeSessionBackend);
