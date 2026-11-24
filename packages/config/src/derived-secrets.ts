// Internal secrets derived from the master key `APP_ENCRYPTION_KEY` (ADR-4007).
// Server-only: exported through `@learny/config/server` and `@learny/config/derived-secrets`, never
// by the package root, so it can never reach a browser bundle. The derivations are identical to
// `python/learny/src/learny/shared/config.py` (cross-language vectors in both test suites).
import { createECDH, createHmac } from 'node:crypto';

export const API_PROXY_KEY_LABEL = 'learny/api-proxy/v1';
export const EMAIL_LINK_KEY_LABEL = 'learny/email-link/v1';
export const VAPID_KEY_LABEL = 'learny/vapid/v1';

// Order of the P-256 group: a derived VAPID scalar lies in [1, n - 1].
const P256_ORDER = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

function subkey(masterKey: string, label: string): Buffer {
  return createHmac('sha256', masterKey.trim()).update(label).digest();
}

/** Relay secret sent by the web to the API (`X-Learny-Proxy-Secret`). */
export function deriveApiProxySecret(masterKey: string): string {
  return subkey(masterKey, API_PROXY_KEY_LABEL).toString('hex');
}

/** Key of the signed e-mail links (unsubscribe). */
export function deriveEmailLinkSecret(masterKey: string): string {
  return subkey(masterKey, EMAIL_LINK_KEY_LABEL).toString('hex');
}

function vapidScalar(masterKey: string): Buffer {
  const digest = BigInt(`0x${subkey(masterKey, VAPID_KEY_LABEL).toString('hex')}`);
  const scalar = (digest % (P256_ORDER - 1n)) + 1n;
  return Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');
}

/** P-256 VAPID private key: base64url of the 32-byte big-endian scalar, without padding. */
export function deriveVapidPrivateKey(masterKey: string): string {
  return vapidScalar(masterKey).toString('base64url');
}

/** Uncompressed P-256 public key (base64url) matching `deriveVapidPrivateKey`. */
export function deriveVapidPublicKey(masterKey: string): string {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(vapidScalar(masterKey));
  return ecdh.getPublicKey().toString('base64url');
}

function configuredMasterKey(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env.APP_ENCRYPTION_KEY?.trim();
  return value === undefined || value === '' ? null : value;
}

/** Relay secret of the running server, or `undefined` without a master key. */
export function apiProxySecretFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const master = configuredMasterKey(env);
  return master === null ? undefined : deriveApiProxySecret(master);
}

/** Public VAPID key of the running server, or `undefined` without a master key. */
export function vapidPublicKeyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const master = configuredMasterKey(env);
  return master === null ? undefined : deriveVapidPublicKey(master);
}
