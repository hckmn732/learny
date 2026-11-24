// Local validation and password strength of the account forms (SPEC-3101 EF-2, EF-5, ET-2).
//
// The rules are the ones of `packages/contracts/src/auth.ts` — the very schemas the web uses —
// so the bounds, the messages and the field names cannot drift (ET-2). The strength indicator is
// the shared function of `@learny/contracts/password-strength` (BR-ACC-01, EF-2).
import {
  PASSWORD_MIN_LENGTH,
  createLoginAccountFormSchema,
  createSignupAccountFormSchema,
  passwordStrength as sharedPasswordStrength,
  type PasswordStrength,
} from '@learny/contracts';
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

export type AuthField = 'email' | 'password' | 'termsAccepted';
export type FieldErrors = Partial<Record<AuthField, string>>;

export interface LoginValues {
  readonly email: string;
  readonly password: string;
}

export interface SignupValues extends LoginValues {
  readonly termsAccepted: boolean;
}

export type ValidationResult<T> =
  { readonly ok: true; readonly values: T } | { readonly ok: false; readonly errors: FieldErrors };

/** Minimum length of a sign-up password (BR-ACC-01, ET-2). */
export const PASSWORD_MIN = PASSWORD_MIN_LENGTH;

const MESSAGES = fr.auth.validation;

const LOGIN_SCHEMA = createLoginAccountFormSchema(MESSAGES);
const SIGNUP_SCHEMA = createSignupAccountFormSchema(MESSAGES);

function fieldOf(path: readonly unknown[]): AuthField | null {
  const first = typeof path[0] === 'string' ? path[0] : '';
  if (first === 'email' || first === 'password' || first === 'termsAccepted') return first;
  return null;
}

function toErrors(
  issues: readonly { readonly path: readonly unknown[]; readonly message: string }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = fieldOf(issue.path);
    if (field !== null && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

/** Validates the sign-in form: an e-mail and a non-empty password (EF-5). */
export function validateLogin(input: LoginValues): ValidationResult<LoginValues> {
  const parsed = LOGIN_SCHEMA.safeParse({ method: 'password', ...input });
  if (parsed.success)
    return { ok: true, values: { email: parsed.data.email, password: input.password } };
  return { ok: false, errors: toErrors(parsed.error.issues) };
}

/** Validates the sign-up form: a 12-character password and the terms case (BR-ACC-02, EF-2). */
export function validateSignup(input: SignupValues): ValidationResult<LoginValues> {
  const parsed = SIGNUP_SCHEMA.safeParse({ method: 'password', ...input });
  if (parsed.success)
    return { ok: true, values: { email: parsed.data.email, password: input.password } };
  return { ok: false, errors: toErrors(parsed.error.issues) };
}

/** Validates an address alone, e.g. in the magic-link sheet (EF-3): `null` when it is valid. */
export function validateEmail(email: string): string | null {
  const parsed = LOGIN_SCHEMA.safeParse({ method: 'magic', email });
  return parsed.success ? null : MESSAGES.email;
}

/** Strength of the typed password, `0` to `4` (EF-2). */
export function passwordStrength(password: string): PasswordStrength {
  return sharedPasswordStrength(password);
}

/** Hint shown under the strength bars, with the web wording (EF-2). */
export function strengthHint(password: string): string {
  if (password.length === 0) return fr.auth.account.strengthEmpty;
  return sharedPasswordStrength(password) >= 3
    ? fr.auth.account.strengthStrong
    : fr.auth.account.strengthWeak;
}

/**
 * Field message of a `VALIDATION_FAILED` answer (`problem+json.errors[].path`), like the web
 * account form (EF-5). `null` when the refusal concerns no field of this form.
 */
export function fieldErrorFromApi(error: unknown): { field: AuthField; message: string } | null {
  if (!isAppError(error) || error.code !== 'VALIDATION_FAILED') return null;
  const issue = error.errors?.[0];
  if (issue === undefined) return null;
  const path = issue.path.endsWith('acceptedTerms')
    ? 'termsAccepted'
    : (issue.path.split('.').pop() ?? '');
  if (path === 'email') return { field: 'email', message: fr.auth.validation.email };
  if (path === 'password') return { field: 'password', message: fr.auth.validation.passwordSignup };
  if (path === 'termsAccepted')
    return { field: 'termsAccepted', message: fr.auth.validation.terms };
  return null;
}
