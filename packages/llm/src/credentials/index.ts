// Public surface of the credential crypto used by @learny/services (SPEC-505 ET-1, ET-4).
// `decryptCredentialKey` is deliberately absent: server-side reads stay inside @learny/llm.
export {
  AES_GCM_ENVELOPE_BYTES,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  KEYRING_KEY_BYTES,
  MASK_BULLETS,
  credentialAad,
  decryptSecret,
  encryptSecret,
  keyFingerprint,
  keyLast4Of,
  keyPrefixOf,
  loadKeyring,
  maskKey,
  sameFingerprint,
} from './crypto';
export type { Keyring } from './crypto';
export { ROTATION_BATCH_SIZE, rotateCredentialKeys } from './rotate';
export type { RotationOptions, RotationReport } from './rotate';
