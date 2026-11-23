// Strength of the sign-up password (SPEC-601 EF-5, shared with the mobile track by SPEC-3101).
//
// Pure function, no Zod and no runtime dependency: the web and the mobile application show the
// same four bars and the same hint, and the server keeps enforcing the 12-character minimum
// (BR-ACC-01). Moving the rule here is a backwards-compatible addition (ADR-3005 § 3): the web
// module `apps/web/lib/auth/password-strength.ts` keeps its own export untouched and the shared
// cases (`password-strength.test.ts`) pin the same expectations.
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/** `0` to `4`: two points for 12+ characters, one for 8+, plus a digit and a symbol. */
export function passwordStrength(password: string): PasswordStrength {
  const lengthPoints = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
  const digit = /[0-9]/.test(password) ? 1 : 0;
  const symbol = /[^A-Za-z0-9]/.test(password) ? 1 : 0;
  return Math.min(4, lengthPoints + digit + symbol) as PasswordStrength;
}
