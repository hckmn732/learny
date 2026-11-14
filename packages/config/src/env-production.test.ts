import { describe, expect, it } from 'vitest';

import { parseServerEnv } from './env';
import { EnvConfigError } from './env-shared';

/** learny-test-only: complete production environment, format-valid but without any real secret. */
const PRODUCTION_ENV: Record<string, string> = {
  APP_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://learny.example',
  NEXT_PUBLIC_SUPABASE_URL: 'https://learny-test-only.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-learni-test-only',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'vapid-public-learny-test-only',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_learny-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-learny-test-only',
  DATABASE_URL: 'postgresql://learny:learny-test-only@db.example:5432/learny',
  APP_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=', // learny-test-only
  INNGEST_EVENT_KEY: 'event-key-learny-test-only',
  INNGEST_SIGNING_KEY: 'signkey-learny-test-only',
  ANTHROPIC_API_KEY: 'sk-ant-learny-test-only',
  VOYAGE_API_KEY: 'pa-learny-test-only',
  RESEND_API_KEY: 're-learny-test-only',
  VAPID_PRIVATE_KEY: 'vapid-private-learny-test-only',
  VAPID_SUBJECT: 'mailto:bonjour@learny.local',
  STRIPE_SECRET_KEY: 'sk_live_learny-test-only',
  STRIPE_WEBHOOK_SECRET: 'whsec_learny-test-only',
  STRIPE_PRICE_ID: 'price_learny-test-only',
  RATE_LIMIT_IP_SECRET: 'learny-test-only-rate-limit-ip-secret',
  EMAIL_LINK_SECRET: 'learny-test-only-email-link-secret-value',
  LEGAL_ENTITY_NAME: 'Learny (apprentissage)',
  LEGAL_ENTITY_ADDRESS: '1 rue de la Connaissance, 75001 Paris',
  LEGAL_CONTACT_EMAIL: 'bonjour@learny.example',
  LEGAL_HOST_NAME: 'learny.example',
};

function issuesOf(overrides: Record<string, string>): string[] {
  try {
    parseServerEnv({ ...PRODUCTION_ENV, ...overrides });
  } catch (error) {
    expect(error).toBeInstanceOf(EnvConfigError);
    return (error as EnvConfigError).issues.map((issue) => `${issue.name}:${issue.code}`);
  }
  return [];
}

describe('[SPEC-009] interdits de la production (CL-4)', () => {
  it('refuse les modes simulés, les journaux SQL, les jobs inline et le dev Inngest', () => {
    expect(issuesOf({ LLM_MODE: 'mock' })).toContain('LLM_MODE:forbidden');
    expect(issuesOf({ STRIPE_MODE: 'mock' })).toContain('STRIPE_MODE:forbidden');
    expect(issuesOf({ EMAIL_MODE: 'memory' })).toContain('EMAIL_MODE:forbidden');
    expect(issuesOf({ PUSH_MODE: 'mock' })).toContain('PUSH_MODE:forbidden');
    expect(issuesOf({ DB_LOG_QUERIES: 'true' })).toContain('DB_LOG_QUERIES:forbidden');
    expect(issuesOf({ JOBS_MODE: 'inline' })).toContain('JOBS_MODE:forbidden');
    expect(issuesOf({ INNGEST_DEV: '1' })).toContain('INNGEST_DEV:forbidden');
  });

  it('exige https pour les URL publiques', () => {
    const app = issuesOf({ NEXT_PUBLIC_APP_URL: 'http://learny.example' });
    expect(app.some((issue) => issue.startsWith('NEXT_PUBLIC_APP_URL:'))).toBe(true);
    const supabase = issuesOf({ NEXT_PUBLIC_SUPABASE_URL: 'http://db.example' });
    expect(supabase.some((issue) => issue.startsWith('NEXT_PUBLIC_SUPABASE_URL:'))).toBe(true);
  });

  it('valide chaque origine autorisée', () => {
    expect(issuesOf({ ALLOWED_ORIGINS: 'https://a.example, https://b.example' })).toEqual([]);
    expect(issuesOf({ ALLOWED_ORIGINS: 'https://a.example,nope' })).toContain(
      'ALLOWED_ORIGINS:invalid',
    );
  });
});
