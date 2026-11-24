import { describe, expect, it } from 'vitest';

import {
  DOCUMENTED_ENV_KEYS,
  PRODUCTION_REQUIRED_KEYS,
  SERVER_ENV_KEYS,
  TOOLING_ENV_KEYS,
  parseServerEnv,
} from './env';
import { PUBLIC_ENV_KEYS, parsePublicEnv } from './env-public';
import { APP_ENVS, EnvConfigError } from './env-shared';

// learny-test-only: 32 zero-free bytes, base64 encoded (not a secret).
const KEY_32_BYTES = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const KEY_BYTES = Buffer.from(KEY_32_BYTES, 'base64');

/** learny-test-only: complete production environment, format-valid but without any real secret. */
const PRODUCTION_ENV: Record<string, string> = {
  APP_ENV: 'production',
  API_INTERNAL_URL: 'https://api.learny.example',
  NEXT_PUBLIC_APP_URL: 'https://learny.example',
  NEXT_PUBLIC_SUPABASE_URL: 'https://learny-test-only.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-learni-test-only',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_learny-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-learny-test-only',
  SUPABASE_JWT_SECRET: 'jwt-secret-learny-test-only',
  DATABASE_URL: 'postgresql://learny:learny-test-only@db.example:5432/learny',
  APP_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=', // learny-test-only
  VOYAGE_API_KEY: 'pa-learny-test-only',
  EMAIL_FROM: 'bonjour@learny.example',
  RESEND_API_KEY: 're-learny-test-only',
  STRIPE_SECRET_KEY: 'sk_live_learny-test-only',
  STRIPE_WEBHOOK_SECRET: 'whsec_learny-test-only',
  STRIPE_PRICE_ID: 'price_learny-test-only',
};

/** ADR-4007: retired variables, derived or constant now; the schema ignores them. */
const RETIRED = [
  'STRIPE_MODE',
  'EMAIL_MODE',
  'PUSH_MODE',
  'JOBS_MODE',
  'RATE_LIMIT_MODE',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'INNGEST_DEV',
  'ANTHROPIC_API_KEY',
  'DEEPGRAM_API_KEY',
  'API_PORT',
  'LEARNY_API_ROLE',
  'SUPABASE_JWKS_URL',
  'TRUST_PROXY',
  'ALLOWED_ORIGINS',
  'API_PROXY_SECRET',
  'API_PROXY_SECRET_PREVIOUS',
  'RATE_LIMIT_IP_SECRET',
  'EMAIL_LINK_SECRET',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'SMTP_PORT',
  'EMBEDDING_DIM',
  'LLM_LIVE_TESTS',
  'SENTRY_AUTH_TOKEN',
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_HOST_NAME',
  'LEGAL_CGU_VERSION',
  'LEGAL_PRIVACY_VERSION',
  'LEARNY_INNGEST_PORT',
  'SMTP_SENDER_NAME',
  'SMTP_ADMIN_EMAIL',
] as const;

function caught(run: () => unknown): EnvConfigError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EnvConfigError);
    return error as EnvConfigError;
  }
  throw new Error('une erreur de configuration était attendue');
}

describe('[SPEC-009] environment', () => {
  it('accepts the four application environments with documented defaults (EF-3)', () => {
    for (const appEnv of APP_ENVS) {
      const env =
        appEnv === 'production' ? parseServerEnv(PRODUCTION_ENV) : parseServerEnv({}, appEnv);
      expect(env.APP_ENV).toBe(appEnv);
      expect(env.LOG_LEVEL).toBe('info');
      expect(env.ALLOW_LOCAL_MODELS).toBe(false);
    }
  });

  it('parses a valid production environment (CA-1)', () => {
    const env = parseServerEnv(PRODUCTION_ENV);

    expect(env.APP_ENV).toBe('production');
    expect(env.ENABLE_SDD_PAGES).toBe(false);
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://learny.example');
    expect(Buffer.from(env.APP_ENCRYPTION_KEY ?? '', 'base64')).toEqual(KEY_BYTES);
  });

  it('documents none of the retired variables and ignores them (ADR-4007)', () => {
    for (const name of RETIRED) {
      expect(DOCUMENTED_ENV_KEYS, name).not.toContain(name);
    }
    const env = parseServerEnv({ ...PRODUCTION_ENV, LLM_MODE: 'mock', API_PROXY_SECRET: 'x' });
    expect(Object.hasOwn(env, 'LLM_MODE')).toBe(false);
    expect(Object.hasOwn(env, 'API_PROXY_SECRET')).toBe(false);
  });

  it('names every missing production variable in a single error (EF-1, CL-1)', () => {
    const error = caught(() => parseServerEnv({ APP_ENV: 'production' }));

    expect(error.names).toEqual([...PRODUCTION_REQUIRED_KEYS].sort());
    expect(error.issues.every((issue) => issue.code === 'missing')).toBe(true);
    expect(error.message).toContain('Configuration production invalide');
  });

  it('fails production when any single required variable is missing (CA-2)', () => {
    for (const name of PRODUCTION_REQUIRED_KEYS) {
      const truncated: Record<string, string> = Object.fromEntries(
        Object.entries(PRODUCTION_ENV).filter(([key]) => key !== name),
      );
      const error = caught(() => parseServerEnv(truncated));
      expect(error.names, name).toContain(name);
    }
  });

  it('never prints a secret value when production fails (CA-2, CL-7)', () => {
    const leaky = {
      ...PRODUCTION_ENV,
      APP_ENCRYPTION_KEY: 'not-a-key-SuperSecretValue', // learny-test-only
      RESEND_API_KEY: ' re-SuperSecretValue ', // learny-test-only
      DATABASE_URL: 'postgresql://learny:SuperSecretValue@db.example:5432/learny',
    };
    const error = caught(() => parseServerEnv(leaky));
    const serialized = `${error.message}\n${JSON.stringify(error.issues)}`;

    expect(error.names).toContain('APP_ENCRYPTION_KEY');
    expect(error.names).toContain('RESEND_API_KEY');
    expect(serialized).not.toContain('SuperSecretValue');
  });

  it('rejects an encryption key of 31 or 33 bytes and never generates a replacement (CL-2)', () => {
    for (const length of [31, 33]) {
      const error = caught(() =>
        parseServerEnv({ APP_ENCRYPTION_KEY: Buffer.alloc(length, 7).toString('base64') }),
      );
      expect(error.names).toEqual(['APP_ENCRYPTION_KEY']);
      expect(error.issues[0]?.code).toBe('invalid');
    }
    expect(parseServerEnv({ APP_ENCRYPTION_KEY: KEY_32_BYTES }).APP_ENCRYPTION_KEY).toBe(
      KEY_32_BYTES,
    );
  });

  it('refuses SDD pages and a frozen clock in production (CL-4, ADR-0047)', () => {
    const error = caught(() => parseServerEnv({ ...PRODUCTION_ENV, ENABLE_SDD_PAGES: 'true' }));
    expect(error.names).toEqual(['ENABLE_SDD_PAGES']);
    expect(error.issues[0]?.code).toBe('forbidden');
    expect(parseServerEnv({ ENABLE_SDD_PAGES: 'true' }, 'local').ENABLE_SDD_PAGES).toBe(true);
    const clock = caught(() =>
      parseServerEnv({ ...PRODUCTION_ENV, CLOCK_FIXED_AT: '2026-11-11T12:20:00Z' }),
    );
    expect(clock.issues).toEqual([{ name: 'CLOCK_FIXED_AT', code: 'forbidden' }]);
  });

  it('only enables the SDD pages with the exact string true (EF-4)', () => {
    expect(parseServerEnv({ ENABLE_SDD_PAGES: 'true' }).ENABLE_SDD_PAGES).toBe(true);
    expect(parseServerEnv({ ENABLE_SDD_PAGES: 'false' }).ENABLE_SDD_PAGES).toBe(false);
    expect(parseServerEnv({}).ENABLE_SDD_PAGES).toBe(false);
    for (const value of ['1', 'TRUE', 'yes']) {
      expect(parseServerEnv({ ENABLE_SDD_PAGES: value }).ENABLE_SDD_PAGES).toBe(false);
    }
  });

  it('accepts local HTTP for the application URL and refuses HTTP elsewhere (CL-5)', () => {
    expect(
      parseServerEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }).NEXT_PUBLIC_APP_URL,
    ).toBe('http://localhost:3000');
    for (const value of ['http://learny.example', 'ftp://localhost:3000', 'not-a-url']) {
      expect(caught(() => parseServerEnv({ NEXT_PUBLIC_APP_URL: value })).names).toEqual([
        'NEXT_PUBLIC_APP_URL',
      ]);
    }
    expect(
      caught(() =>
        parseServerEnv({
          ...PRODUCTION_ENV,
          NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        }),
      ).names,
    ).toEqual(['NEXT_PUBLIC_APP_URL']);
  });

  it('accepts private Docker API URLs without weakening public service URLs', () => {
    for (const API_INTERNAL_URL of ['http://api:3001', 'https://api.internal:3001']) {
      expect(parseServerEnv({ API_INTERNAL_URL }).API_INTERNAL_URL).toBe(API_INTERNAL_URL);
    }
    for (const API_INTERNAL_URL of [
      'ftp://api:3001',
      'http://user:pass@api:3001',
      'http://api:3001/path',
      'http://api:3001?query=1',
    ]) {
      expect(caught(() => parseServerEnv({ API_INTERNAL_URL })).names).toEqual([
        'API_INTERNAL_URL',
      ]);
    }
  });

  it('accepts a bare sender address or a named one (ADR-4007)', () => {
    expect(parseServerEnv({ EMAIL_FROM: 'bonjour@learny.example' }).EMAIL_FROM).toBe(
      'bonjour@learny.example',
    );
    expect(parseServerEnv({ EMAIL_FROM: 'Learny <bonjour@learny.example>' }).EMAIL_FROM).toBe(
      'Learny <bonjour@learny.example>',
    );
    expect(caught(() => parseServerEnv({ EMAIL_FROM: 'nope' })).names).toEqual(['EMAIL_FROM']);
  });

  it('keeps a secret with surrounding spaces invalid instead of cleaning it (CL-7)', () => {
    const error = caught(() =>
      parseServerEnv({ ...PRODUCTION_ENV, STRIPE_SECRET_KEY: ' sk_live_learny-test-only ' }),
    );
    expect(error.names).toEqual(['STRIPE_SECRET_KEY']);
    expect(error.message).not.toContain('sk_live');
  });

  it('validates documented values and the time zone without logging them (ET-2)', () => {
    expect(caught(() => parseServerEnv({ TZ: 'Mars/Olympus' })).names).toEqual(['TZ']);
    expect(parseServerEnv({ TZ: 'Europe/Paris' }).APP_ENV).toBe('local');
    expect(caught(() => parseServerEnv({ APP_ENV: 'staging' })).names).toEqual(['APP_ENV']);
    expect(caught(() => parseServerEnv({ CLOCK_FIXED_AT: '2026-11-11' })).names).toEqual([
      'CLOCK_FIXED_AT',
    ]);
    expect(parseServerEnv({ CLOCK_FIXED_AT: '2026-11-11T12:20:00Z' }).CLOCK_FIXED_AT).toBe(
      '2026-11-11T12:20:00Z',
    );
    expect(caught(() => parseServerEnv({ LOG_LEVEL: 'chatty' })).names).toEqual(['LOG_LEVEL']);
  });

  it('lets the caller force the application environment at startup (EF-1)', () => {
    expect(parseServerEnv({ APP_ENV: 'local' }, 'test').APP_ENV).toBe('test');
  });

  it('exports only the five public variables and no server field (EF-2, CA-2)', () => {
    const pub = parsePublicEnv({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'https://learny-test-only.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-learny-test-only',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'vapid-learny-test-only',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_learny-test-only',
      NEXT_PUBLIC_SENTRY_DSN: 'https://learny-test-only.sentry.io/1',
      NEXT_PUBLIC_UNKNOWN_CACHE: 'ignored',
      APP_ENCRYPTION_KEY: 'learny-test-only-not-public',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-learny-test-only',
      STRIPE_SECRET_KEY: 'sk_live_learny-test-only',
    });

    expect(Object.keys(pub).sort()).toEqual([...PUBLIC_ENV_KEYS].sort());
    expect(PUBLIC_ENV_KEYS).toHaveLength(5);
    const serialized = JSON.stringify(pub);
    for (const name of SERVER_ENV_KEYS) expect(Object.hasOwn(pub, name), name).toBe(false);
    expect(serialized).not.toContain('learny-test-only-not-public');
    expect(serialized).not.toContain('vapid-learny-test-only');
    expect(parsePublicEnv({}).NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it('rejects an invalid public URL with the variable name only (EF-2)', () => {
    const error = caught(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: 'http://10.0.0.1:3000' }));
    expect(error.names).toEqual(['NEXT_PUBLIC_APP_URL']);
  });

  it('documents each key exactly once across the public, server and tooling lists (CA-3)', () => {
    const all = DOCUMENTED_ENV_KEYS;
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([...SERVER_ENV_KEYS, ...PUBLIC_ENV_KEYS, ...TOOLING_ENV_KEYS]);
    for (const key of PUBLIC_ENV_KEYS) expect(key.startsWith('NEXT_PUBLIC_')).toBe(true);
    for (const key of SERVER_ENV_KEYS) expect(key.startsWith('NEXT_PUBLIC_')).toBe(false);
  });
});
