// Simulated environments of the SPEC-009 startup tests. Values are public test doubles: they
// contain the `learny-test-only` marker and are refused as real secrets by the repository scanner.

/** Marker that must never appear in the rendered page. */
export const DEMO_SECRET_SENTINEL = 'learny-test-only-sentinel';

/** Local environment whose provider secrets are present: used to show configured statuses. */
export const DEMO_LOCAL_ENV = {
  APP_ENV: 'local',
  APP_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=', // learny-test-only
  VOYAGE_API_KEY: 'pa-learny-test-only-sentinel', // learny-test-only
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-learny-test-only-sentinel', // learny-test-only
  SUPABASE_JWT_SECRET: 'jwt-secret-learny-test-only-sentinel', // learny-test-only
  STRIPE_SECRET_KEY: 'sk_live_learny-test-only-sentinel', // learny-test-only
  RESEND_API_KEY: 'resend-learny-test-only-sentinel', // learny-test-only
} as const;

/** Server variables whose presence is reported without their value. */
export const DEMO_SECRET_KEYS = [
  'APP_ENCRYPTION_KEY',
  'VOYAGE_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'RESEND_API_KEY',
] as const;

/** Truncated production environment: the startup names every variable to fix (EF-1, CL-4). */
export const DEMO_INVALID_PRODUCTION_ENV = {
  APP_ENV: 'production',
  ENABLE_SDD_PAGES: 'true',
  DATABASE_URL: 'postgresql://learny:learny-test-only-sentinel@db.example/learny',
} as const;
