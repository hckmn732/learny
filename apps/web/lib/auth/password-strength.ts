// Strength of the sign-up password (SPEC-601 EF-5). Pure function: the same rules drive the four
// bars and the hint of the account form; the server only enforces the 12-character minimum.
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function passwordStrength(password: string): PasswordStrength {
  const lengthPoints = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
  const digit = /[0-9]/.test(password) ? 1 : 0;
  const symbol = /[^A-Za-z0-9]/.test(password) ? 1 : 0;
  return Math.min(4, lengthPoints + digit + symbol) as PasswordStrength;
}
