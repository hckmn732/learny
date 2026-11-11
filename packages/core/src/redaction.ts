// Redaction of sensitive values in logs and telemetry (SPEC-010, EF-2, ET-1, CL-2).
// Two layers cooperate: pino `redact` removes whole known paths, and these helpers scrub the
// strings that reach the output (messages, allowed fields, Sentry tags).

/** Replacement written in place of a sensitive value. */
export const REDACTED = '[Redacted]';

/** Key fragments whose value is never written, at any level of an arbitrary object. */
export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'email',
  'prompt',
  'completion',
  'response',
  'contribution',
  'apport',
  'body',
  'content',
  'dsn',
  'credential',
] as const;

const EMAIL = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const TOKEN =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9_-]{8,}|sb_secret_[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;
const AUTHORIZATION = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE =
  /\b(password|passwd|secret|token|api[_-]?key|cookie|set-cookie|authorization|prompt|response|completion|contribution|apport|body)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const LONG_SECRET = /\b[A-Za-z0-9_-]{40,}\b/g;

/** True when a key names data that must never leave the process. */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Scrubs a string: e-mail addresses, provider keys, bearer tokens, `key=value` secrets and long
 * opaque values. Used on messages and on every value kept by the allow-list serialiser.
 */
export function redactText(value: string): string {
  return value
    .replace(AUTHORIZATION, `$1 ${REDACTED}`)
    .replace(KEY_VALUE, `$1$2${REDACTED}`)
    .replace(TOKEN, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(LONG_SECRET, REDACTED);
}
