// CSP nonce validation shared by the HTML pages of the API (SPEC-1004) and the web policy
// (SPEC-805). Pure module: no dependency, so the middleware and the server package both use the
// same pattern without pulling any other code.
export const CSP_NONCE_BYTES = 18;

/** 18 random bytes give a 24-character base64 nonce; anything else is refused. */
const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,}={0,2}$/;

/** True for a nonce shaped by `createCspNonce`; a malformed header value is ignored. */
export function isValidCspNonce(nonce: string): boolean {
  return NONCE_PATTERN.test(nonce);
}
