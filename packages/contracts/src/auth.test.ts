import { describe, expect, it } from 'vitest';

import {
  accountFormSchema,
  loginAccountFormSchema,
  MagicLinkInput,
  ResendInput,
  SignInInput,
  SignUpInput,
} from './auth';

const email = 'Alex.Perrin@Example.com';
// Run-time values: no credential literal in the repository.
const long = 'x'.repeat(12);

describe('[SPEC-202] contrats', () => {
  it('requires 12 characters at least for a new password, no composition rule (BR-ACC-01)', () => {
    const base = { email, acceptedTerms: true as const };
    expect(SignUpInput.safeParse({ ...base, password: 'x'.repeat(11) }).success).toBe(false);
    expect(SignUpInput.safeParse({ ...base, password: long }).success).toBe(true);
    expect(SignUpInput.safeParse({ ...base, password: 'x'.repeat(72) }).success).toBe(true);
    expect(SignUpInput.safeParse({ ...base, password: 'x'.repeat(73) }).success).toBe(false);
  });

  it('only checks that a sign-in password is present', () => {
    expect(SignInInput.safeParse({ email, password: 'x' }).success).toBe(true);
    expect(SignInInput.safeParse({ email, password: '' }).success).toBe(false);
  });

  it('normalises the e-mail address (trim, lower case) and refuses an invalid one', () => {
    const parsed = SignInInput.parse({ email: `  ${email} `, password: 'x' });
    expect(parsed.email).toBe('alex.perrin@example.com');
    for (const bad of ['', 'pas-un-email', 'a@b', `${'a'.repeat(250)}@example.com`]) {
      expect(SignInInput.safeParse({ email: bad, password: 'x' }).success, bad).toBe(false);
    }
  });

  it('refuses a sign-up without the acceptance of the terms', () => {
    expect(SignUpInput.safeParse({ email, password: long, acceptedTerms: false }).success).toBe(
      false,
    );
    expect(SignUpInput.safeParse({ email, password: long }).success).toBe(false);
    expect(MagicLinkInput.safeParse({ mode: 'sign-up', email, acceptedTerms: false }).success).toBe(
      false,
    );
    expect(MagicLinkInput.safeParse({ mode: 'sign-up', email }).success).toBe(false);
  });

  it('does not ask for the terms to sign in by link, and discriminates on mode', () => {
    expect(MagicLinkInput.safeParse({ mode: 'sign-in', email }).success).toBe(true);
    expect(MagicLinkInput.safeParse({ mode: 'sign-in', email, next: '/agenda' }).success).toBe(
      true,
    );
    expect(MagicLinkInput.safeParse({ mode: 'other', email }).success).toBe(false);
    expect(MagicLinkInput.safeParse({ email }).success).toBe(false);
  });

  it('refuses an unknown time zone (CL-9) and accepts IANA ones', () => {
    const base = { email, password: long, acceptedTerms: true as const };
    expect(SignUpInput.safeParse({ ...base, timezone: 'Mars/Phobos' }).success).toBe(false);
    expect(SignUpInput.safeParse({ ...base, timezone: 'Europe/Paris' }).success).toBe(true);
    expect(SignUpInput.safeParse({ ...base, timezone: 'UTC' }).success).toBe(true);
    expect(SignUpInput.safeParse({ ...base, timezone: 'x'.repeat(65) }).success).toBe(false);
  });

  it('accepts only the two resend kinds', () => {
    expect(ResendInput.safeParse({ email, kind: 'signup' }).success).toBe(true);
    expect(ResendInput.safeParse({ email, kind: 'magic_link' }).success).toBe(true);
    expect(ResendInput.safeParse({ email, kind: 'recovery' }).success).toBe(false);
  });
});

describe('[SPEC-601] formulaires de compte', () => {
  it('oriente les messages d’erreur par méthode (ET-2, EF-6)', () => {
    const base = { email, method: 'magic' as const, termsAccepted: true as const };
    expect(
      accountFormSchema.safeParse({ ...base, email: 'invalide' }).error?.issues[0]?.message,
    ).toBe('Saisissez une adresse e-mail valide.');
    expect(
      accountFormSchema.safeParse({
        email,
        method: 'password',
        password: 'x'.repeat(11),
        termsAccepted: true,
      }).error?.issues[0]?.message,
    ).toBe('Le mot de passe doit faire 12 caractères au moins.');
    expect(
      accountFormSchema.safeParse({ email, method: 'magic', termsAccepted: false }).error?.issues[0]
        ?.message,
    ).toBe('Acceptez les conditions pour créer votre compte.');
  });

  it('ne demande ni conditions ni mot de passe long en connexion par lien (EF-4)', () => {
    expect(loginAccountFormSchema.safeParse({ email, method: 'magic' }).success).toBe(true);
    expect(
      loginAccountFormSchema.safeParse({ email, method: 'password', password: '' }).success,
    ).toBe(false);
    expect(
      loginAccountFormSchema.safeParse({ email, method: 'password', password: 'x' }).success,
    ).toBe(true);
    expect(
      accountFormSchema.safeParse({
        email: `  ${email.toUpperCase()} `,
        method: 'magic',
        termsAccepted: true,
      }).data?.email,
    ).toBe('ALEX.PERRIN@EXAMPLE.COM');
  });
});
