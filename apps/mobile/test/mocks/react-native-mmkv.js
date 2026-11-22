// Stub of `react-native-mmkv` for Jest (SPEC-3003 ET-1).
//
// The real module is a Nitro module: it needs a device. Component tests never assert the
// encryption itself (the Vitest suite `src/auth/secure-storage.test.ts` proves it with an
// injected backend); they only need a store that behaves like MMKV.
class MMKV {
  constructor(options = {}) {
    this.id = options.id;
    this.encryptionKey = options.encryptionKey;
    this.values = new Map();
  }

  getString(key) {
    return this.values.get(key);
  }

  set(key, value) {
    this.values.set(key, String(value));
  }

  delete(key) {
    this.values.delete(key);
  }

  clearAll() {
    this.values.clear();
  }
}

module.exports = { MMKV };
