import { z } from 'zod';

import { isValidIanaZone } from '@learny/core';

import { Empty } from './common';
import { defineRoute } from './define-route';

// Authentication contracts and routes (SPEC-202 ET-1, ET-2; BR-ACC-01, BR-ACC-03, BR-ACC-09).
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

/**
 * Account form of the sign-up screen (SPEC-601 ET-2). The union is discriminated on `method` so
 * the password is only required when that method is chosen.
 */
export function createSignupAccountFormSchema(
  messages: AccountFormMessages = ACCOUNT_FORM_MESSAGES,
) {
  const email = z.string().trim().regex(ACCOUNT_EMAIL_RE, { error: messages.email });
  const termsAccepted = z.literal(true, { error: messages.terms });
  return z.discriminatedUnion('method', [
    z.object({ method: z.literal('magic'), email, termsAccepted }),
    z.object({
      method: z.literal('password'),
      email,
      password: z.string().min(PASSWORD_MIN_LENGTH, { error: messages.passwordSignup }),
      termsAccepted,
    }),
  ]);
}

/** Same form in sign-in mode: no terms, a password only checked for presence (EF-4). */
export function createLoginAccountFormSchema(
  messages: AccountFormMessages = ACCOUNT_FORM_MESSAGES,
) {
  const email = z.string().trim().regex(ACCOUNT_EMAIL_RE, { error: messages.email });
  return z.discriminatedUnion('method', [
    z.object({ method: z.literal('magic'), email }),
    z.object({
      method: z.literal('password'),
      email,
      password: z.string().min(1, { error: messages.passwordLogin }),
    }),
  ]);
}

export const accountFormSchema = createSignupAccountFormSchema();
export const loginAccountFormSchema = createLoginAccountFormSchema();
export type AccountFormValues = z.infer<typeof accountFormSchema>;

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const Timezone = z
  .string()
  .max(64)
  .refine((zone) => isValidIanaZone(zone), 'Fuseau horaire inconnu');
const Next = z.string().max(512);

export const MagicLinkInput = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('sign-up'),
    email: Email,
    acceptedTerms: z.literal(true),
    timezone: Timezone.optional(),
  }),
  z.object({ mode: z.literal('sign-in'), email: Email, next: Next.optional() }),
]);
export type MagicLinkInput = z.infer<typeof MagicLinkInput>;

export const SignUpInput = z.object({
  email: Email,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  acceptedTerms: z.literal(true),
  timezone: Timezone.optional(),
});
export type SignUpInput = z.infer<typeof SignUpInput>;

export const SignInInput = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: Next.optional(),
});
export type SignInInput = z.infer<typeof SignInInput>;

export const ResendInput = z.object({ email: Email, kind: z.enum(['signup', 'magic_link']) });
export type ResendInput = z.infer<typeof ResendInput>;

export const SignInOutput = z.object({ destination: z.string() });
export type SignInOutput = z.infer<typeof SignInOutput>;

export const SignUpOutput = z.object({ status: z.literal('confirmation_sent') });
export type SignUpOutput = z.infer<typeof SignUpOutput>;

export const CALLBACK_TYPES = ['magiclink', 'signup', 'email'] as const;
export const CallbackQuery = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.enum(CALLBACK_TYPES),
  next: Next.optional(),
});
export type CallbackQuery = z.infer<typeof CallbackQuery>;

export const authMagicLink = defineRoute({
  id: 'auth.magicLink',
  method: 'POST',
  path: '/api/v1/auth/magic-link',
  auth: 'public',
  body: MagicLinkInput,
  output: Empty,
  successStatus: 202,
  rateLimit: 'auth',
  summary: 'Envoie un lien magique de connexion ou d’inscription.',
  errors: ['VALIDATION_FAILED', 'RESEND_TOO_SOON', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
});

export const authSignUp = defineRoute({
  id: 'auth.signUp',
  method: 'POST',
  path: '/api/v1/auth/sign-up',
  auth: 'public',
  body: SignUpInput,
  output: SignUpOutput,
  successStatus: 201,
  rateLimit: 'auth',
  summary: 'Crée un compte par e-mail et mot de passe (confirmation obligatoire).',
  errors: ['VALIDATION_FAILED', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
});

export const authSignIn = defineRoute({
  id: 'auth.signIn',
  method: 'POST',
  path: '/api/v1/auth/sign-in',
  auth: 'public',
  body: SignInInput,
  output: SignInOutput,
  successStatus: 200,
  rateLimit: 'auth',
  summary: 'Connecte par e-mail et mot de passe ; renvoie la destination.',
  errors: [
    'VALIDATION_FAILED',
    'INVALID_CREDENTIALS',
    'EMAIL_NOT_CONFIRMED',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
  ],
});

export const authResend = defineRoute({
  id: 'auth.resend',
  method: 'POST',
  path: '/api/v1/auth/resend',
  auth: 'public',
  body: ResendInput,
  output: Empty,
  successStatus: 202,
  rateLimit: 'auth',
  summary: 'Renvoie le lien de confirmation ou de connexion (un par minute).',
  errors: ['VALIDATION_FAILED', 'RESEND_TOO_SOON', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
});

export const authSignOut = defineRoute({
  id: 'auth.signOut',
  method: 'POST',
  path: '/api/v1/auth/sign-out',
  auth: 'public',
  output: null,
  successStatus: 204,
  rateLimit: 'auth',
  summary: 'Ferme la session (idempotent, 204 même sans session).',
  errors: [],
});

export const authCallback = defineRoute({
  id: 'auth.callback',
  method: 'GET',
  path: '/api/v1/auth/callback',
  auth: 'public',
  query: CallbackQuery,
  output: null,
  successStatus: 302,
  rateLimit: 'auth',
  summary: 'Vérifie le lien reçu par e-mail, pose la session et redirige.',
  errors: [],
});

export const authRoutes = {
  authMagicLink,
  authSignUp,
  authSignIn,
  authResend,
  authSignOut,
  authCallback,
} as const;
