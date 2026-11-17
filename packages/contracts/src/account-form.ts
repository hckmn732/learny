// Account form of SCR-01 without Zod (SPEC-601 ET-2, SPEC-804): the sign-in and sign-up pages
// validate in the browser with these few rules, so the Zod runtime never ships with them. The Zod
// schemas of `./auth` encode the same rules for the server and are checked against this module.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

/** Client-side address check of the account form (SPEC-601 EF-6). */
export const ACCOUNT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AccountFormMessages {
  email: string;
  passwordSignup: string;
  passwordLogin: string;
  terms: string;
}

/** Default messages; `apps/web` passes the exact texts of `messages.auth` (ET-2). */
export const ACCOUNT_FORM_MESSAGES: AccountFormMessages = {
  email: 'Saisissez une adresse e-mail valide.',
  passwordSignup: 'Le mot de passe doit faire 12 caractères au moins.',
  passwordLogin: 'Saisissez votre mot de passe.',
  terms: 'Acceptez les conditions pour créer votre compte.',
};

export type AccountFormMode = 'signup' | 'login';

export interface AccountFormInput {
  method: 'magic' | 'password';
  email: string;
  password?: string | undefined;
  termsAccepted?: boolean | undefined;
}

export type AccountFormField = 'email' | 'password' | 'termsAccepted';

export type AccountFormResult =
  | { success: true; data: AccountFormInput }
  | { success: false; errors: Partial<Record<AccountFormField, string>> };

/**
 * Same outcome as `createSignupAccountFormSchema` / `createLoginAccountFormSchema`: trimmed
 * e-mail, password only for the password method (12 characters at sign-up, present at sign-in),
 * terms accepted at sign-up. Every failing field gets its message.
 */
export function validateAccountForm(
  mode: AccountFormMode,
  input: AccountFormInput,
  messages: AccountFormMessages = ACCOUNT_FORM_MESSAGES,
): AccountFormResult {
  const errors: Partial<Record<AccountFormField, string>> = {};
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!ACCOUNT_EMAIL_RE.test(email)) errors.email = messages.email;
  const password = typeof input.password === 'string' ? input.password : '';
  if (input.method === 'password') {
    const min = mode === 'signup' ? PASSWORD_MIN_LENGTH : 1;
    if (password.length < min) {
      errors.password = mode === 'signup' ? messages.passwordSignup : messages.passwordLogin;
    }
  }
  if (mode === 'signup' && input.termsAccepted !== true) errors.termsAccepted = messages.terms;
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return {
    success: true,
    data: {
      method: input.method,
      email,
      ...(input.method === 'password' ? { password } : {}),
      ...(mode === 'signup' ? { termsAccepted: true } : {}),
    },
  };
}
