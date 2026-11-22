// Credentials of the demonstration account (SPEC-3003 EF-9, § 10).
//
// The SDD page signs in by itself with the account of the seed; the password comes from the build
// environment (`MOBILE_DEMO_PASSWORD` of `apps/mobile/e2e/e2e.env`, turned into an
// `EXPO_PUBLIC_SDD_*` variable by the e2e build) and is never rendered, logged nor committed.
// A normal build has neither variable: the page then shows the signed-out state and no form.
//
// The member expressions are written literally because the Expo Babel plugin inlines
// `process.env.EXPO_PUBLIC_*` at build time (same rule as `src/config.ts`).
export interface DemoCredentials {
  readonly email: string;
  readonly password: string;
}

/** Credentials of the SDD build, or `null` when the build carries none. */
export function readDemoCredentials(): DemoCredentials | null {
  const email = process.env.EXPO_PUBLIC_SDD_DEMO_EMAIL as string | undefined;
  const password = process.env.EXPO_PUBLIC_SDD_DEMO_PASSWORD as string | undefined;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (email === '' || password === '') return null;
  return { email, password };
}
