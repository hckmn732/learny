// Credentials of the demonstration accounts (SPEC-3003 EF-9, § 10; SPEC-4003 CA-3).
//
// The SDD page signs in by itself with the account of the seed; the password comes from the build
// environment (`MOBILE_DEMO_PASSWORD` of `apps/mobile/e2e/e2e.env`, turned into an
// `EXPO_PUBLIC_SDD_*` variable by the e2e build) and is never rendered, logged nor committed.
// `kind = 'nokey'` selects the account without any AI key, used only to prove the blocking banner
// of the mode simple. A normal build has neither variable: the page then shows the signed-out
// state and no form.
//
// The member expressions are written literally because the Expo Babel plugin inlines
// `process.env.EXPO_PUBLIC_*` at build time (same rule as `src/config.ts`).
export interface DemoCredentials {
  readonly email: string;
  readonly password: string;
}

export type DemoAccount = 'default' | 'nokey' | 'e2e';

/** Credentials of the SDD build, or `null` when the build carries none. */
export function readDemoCredentials(kind: DemoAccount = 'default'): DemoCredentials | null {
  const email =
    kind === 'nokey'
      ? (process.env.EXPO_PUBLIC_SDD_NOKEY_EMAIL as string | undefined)
      : kind === 'e2e'
        ? (process.env.EXPO_PUBLIC_SDD_E2E_EMAIL as string | undefined)
        : (process.env.EXPO_PUBLIC_SDD_DEMO_EMAIL as string | undefined);
  const password =
    kind === 'nokey'
      ? (process.env.EXPO_PUBLIC_SDD_NOKEY_PASSWORD as string | undefined)
      : kind === 'e2e'
        ? (process.env.EXPO_PUBLIC_SDD_E2E_PASSWORD as string | undefined)
        : (process.env.EXPO_PUBLIC_SDD_DEMO_PASSWORD as string | undefined);
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (email === '' || password === '') return null;
  return { email, password };
}
