// Server environment: the single validation point for every runtime variable (SPEC-009, ET-1).
// Imported through `@learny/config/server` only, never by a client component (ET-6).
//
// ADR-4007: the contract is minimal. The service modes are derived by the Python backend from
// `APP_ENV` (ADR-2042), the internal secrets are subkeys of `APP_ENCRYPTION_KEY`, the legal
// identity is a code constant: none of them is a variable any more.
import { z } from 'zod';

import { PUBLIC_ENV_KEYS, publicEnvSchema } from './env-public';
import {
  APP_ENVS,
  EnvConfigError,
  isIanaTimeZone,
  isInternalServiceUrl,
  isServiceUrl,
  normalizeEnv,
  toEnvIssues,
  type AppEnv,
  type EnvInput,
  type EnvIssue,
} from './env-shared';

/** Server-only variables still read at runtime: never exported by the package root (EF-2, ET-6). */
export const SERVER_ENV_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'APP_ENCRYPTION_KEY',
  'APP_ENCRYPTION_KEY_PREVIOUS',
  'LOG_LEVEL',
  'APP_VERSION',
  'GIT_COMMIT',
  'API_INTERNAL_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'ALLOW_LOCAL_MODELS',
  'VOYAGE_API_KEY',
  'SEARCH_API_KEY',
  'SMTP_HOST',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'SENTRY_DSN',
  'CLOCK_FIXED_AT',
  'ENABLE_SDD_PAGES',
] as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];

/**
 * Variables of the toolchain (pnpm, Playwright, test clients, SDD scripts, Compose) kept in
 * `.env.example` but outside the runtime schema: the application never reads them (ET-5).
 */
export const TOOLING_ENV_KEYS = [
  'SDD_PUSH',
  'E2E_SKIP_BUILD',
  'CHROME_PATH',
  // ADR-0048: the test runners refuse any value but `mock` (packages/testing, assertMockLlm).
  'LLM_MODE',
  // Mailpit API read by the authentication test helpers (packages/testing).
  'MAILPIT_URL',
  // Pool size and SQL logging of the test database client (packages/testing).
  'DATABASE_POOL_MAX',
  'DB_LOG_QUERIES',
  // Self-hosted stack (SPEC-012): consumed by Docker Compose and the image builds, not by the app.
  'LEARNY_PUBLIC_APP_URL',
  'LEARNY_PUBLIC_SUPABASE_URL',
  'LEARNY_WEB_PORT',
  'LEARNY_SUPABASE_PORT',
  'LEARNY_MAILPIT_SMTP_PORT',
  'LEARNY_MAILPIT_UI_PORT',
  // Postgres superuser password consumed by the self-hosted Compose file (SPEC-012).
  'POSTGRES_PASSWORD',
] as const;

/** Standard variables of Node and the CI, never part of the documented application contract. */
export const STANDARD_ENV_KEYS = ['TZ', 'CI', 'PORT', 'NEXT_RUNTIME'] as const;

/** Every documented key: the coherence test compares this list with `.env.example` (CA-3). */
export const RUNTIME_ENV_KEYS: readonly string[] = [...SERVER_ENV_KEYS, ...PUBLIC_ENV_KEYS];

export const DOCUMENTED_ENV_KEYS: readonly string[] = [...RUNTIME_ENV_KEYS, ...TOOLING_ENV_KEYS];

/** Required for `APP_ENV=production` (ET-3, ADR-4007). Sentry and web search stay optional. */
export const PRODUCTION_REQUIRED_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'APP_ENCRYPTION_KEY',
  'API_INTERNAL_URL',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'VOYAGE_API_KEY',
] as const;

const STATIC_DEFAULTS = {
  LOG_LEVEL: 'info',
  ALLOW_LOCAL_MODELS: 'false',
  ENABLE_SDD_PAGES: 'false',
} as const;

/** Documented defaults: local and test run without any provider key (EF-1). */
export function envDefaults(appEnv: AppEnv): Record<string, string> {
  return {
    ...STATIC_DEFAULTS,
    ...(appEnv === 'production' ? {} : { API_INTERNAL_URL: 'http://127.0.0.1:3001' }),
    APP_ENV: appEnv,
  };
}

const trimmed = (value: unknown): unknown => (typeof value === 'string' ? value.trim() : value);

function enumOf<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(trimmed, z.enum(values));
}

const booleanString = z.preprocess(
  trimmed,
  z.enum(['true', 'false']).transform((value) => value === 'true'),
);

const serviceUrl = z.string().refine(isServiceUrl, 'invalid-url');
const internalServiceUrl = z.string().refine(isInternalServiceUrl, 'invalid-url');
const nonEmpty = z.string().min(1);
// A secret keeps its exact bytes: surrounding spaces make it invalid rather than "cleaned" (CL-7).
const secret = z.string().min(1).regex(/^\S+$/, 'no-whitespace');
const encryptionKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'base64')
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'aes-256-key');
const emailFrom = z
  .string()
  .regex(/^([^<>]*<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/, 'from');
const isoInstant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, 'instant')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'instant');
const version = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/, 'version');
const commit = z.string().regex(/^[0-9a-f]{7,40}$/i, 'commit');

const serverFields = {
  NODE_ENV: enumOf(['development', 'test', 'production']).optional(),
  APP_ENV: enumOf(APP_ENVS),
  // 32-byte AES-256-GCM master key; 31 or 33 bytes fail at startup, no fallback key (CL-2).
  APP_ENCRYPTION_KEY: encryptionKey.optional(),
  APP_ENCRYPTION_KEY_PREVIOUS: encryptionKey.optional(),
  LOG_LEVEL: enumOf(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  APP_VERSION: version.optional(),
  GIT_COMMIT: commit.optional(),
  API_INTERNAL_URL: internalServiceUrl.optional(),
  SUPABASE_SERVICE_ROLE_KEY: secret.optional(),
  SUPABASE_JWT_SECRET: secret.optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/\S+$/, 'postgres-url')
    .optional(),
  ALLOW_LOCAL_MODELS: booleanString,
  VOYAGE_API_KEY: secret.optional(),
  SEARCH_API_KEY: secret.optional(),
  SMTP_HOST: nonEmpty.optional(),
  EMAIL_FROM: emailFrom.optional(),
  RESEND_API_KEY: secret.optional(),
  STRIPE_SECRET_KEY: secret.optional(),
  STRIPE_WEBHOOK_SECRET: secret.optional(),
  STRIPE_PRICE_ID: secret.optional(),
  SENTRY_DSN: serviceUrl.optional(),
  CLOCK_FIXED_AT: isoInstant.optional(),
  // EF-4: only the exact string `true` enables the demo pages; any other value disables them
  // (the runtime guard of SPEC-006 keeps answering 404 instead of crashing).
  ENABLE_SDD_PAGES: z.preprocess(trimmed, z.string()).transform((value) => value === 'true'),
} as const;

// Public variables are carried by the server configuration object too (mail links, redirects):
// they hold no secret (EF-2) and share the validators of the public schema.
const serverEnvShape = { ...serverFields, ...publicEnvSchema.shape };

const serverEnvBase = z.object(serverEnvShape);

/** Production requirements: replayable in one pass, one error, no value (EF-1, EF-3). */
function checkEnvironment(value: z.infer<typeof serverEnvBase>, ctx: z.RefinementCtx): void {
  const report = (name: string, code: EnvIssue['code']): void => {
    ctx.addIssue({ code: 'custom', path: [name], message: code });
  };
  const field = (name: string): unknown => (value as Record<string, unknown>)[name];

  if (value.APP_ENV === 'production') {
    for (const name of PRODUCTION_REQUIRED_KEYS) {
      if (field(name) === undefined) report(name, 'missing');
    }
    if (value.ENABLE_SDD_PAGES) report('ENABLE_SDD_PAGES', 'forbidden');
    // ADR-0047: a frozen clock is a test and QA device only, like in the Python backend.
    if (value.CLOCK_FIXED_AT !== undefined) report('CLOCK_FIXED_AT', 'forbidden');
    for (const name of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const) {
      const url = field(name);
      if (typeof url === 'string' && !url.startsWith('https://')) report(name, 'incompatible');
    }
  }
}

export const serverEnvSchema = serverEnvBase.superRefine(checkEnvironment);

/** Typed server configuration, derived from the schema so it cannot drift (ET-1). */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function isAppEnv(value: string | undefined): value is AppEnv {
  return value !== undefined && (APP_ENVS as readonly string[]).includes(value);
}

// A key list that drifts from the schema would silently skip a variable: fail at import time.
function assertKeys(scope: string, shape: Record<string, unknown>, keys: readonly string[]): void {
  const declared = Object.keys(shape).sort();
  const listed = [...keys].sort();
  if (declared.join(',') !== listed.join(',')) {
    throw new Error(`${scope} : la liste des clés diverge du schéma (${declared.join(', ')}).`);
  }
}

assertKeys('ENV', serverEnvShape, RUNTIME_ENV_KEYS);

/**
 * Validates the server environment and returns a typed object. Unknown variables (retired ones
 * included) are ignored. `appEnv` overrides `APP_ENV` (startup wiring); production fails on the
 * first run with every missing or invalid variable named, never a value (EF-1, CL-1).
 */
export function parseServerEnv(raw: EnvInput = {}, appEnv?: AppEnv): ServerEnv {
  const input = normalizeEnv(raw);
  const requested = appEnv ?? input.APP_ENV ?? 'local';
  const effectiveEnv = isAppEnv(requested) ? requested : 'local';
  // Defaults first, then the provided values: an empty variable falls back to its documented
  // default instead of erasing it (ET-2, EF-3).
  const data: Record<string, string | undefined> = {
    ...envDefaults(effectiveEnv),
    APP_ENV: requested,
  };
  for (const [key, value] of Object.entries(input)) {
    // `requested` already resolved APP_ENV, with or without the explicit override.
    if (key !== 'APP_ENV' && value !== undefined) data[key] = value;
  }
  const extra: EnvIssue[] = [];
  const timeZone = input.TZ;
  if (timeZone !== undefined && !isIanaTimeZone(timeZone))
    extra.push({ name: 'TZ', code: 'invalid' });

  const parsed = serverEnvSchema.safeParse(data);
  if (!parsed.success) throw new EnvConfigError(requested, toEnvIssues(parsed.error, extra));
  if (extra.length > 0) throw new EnvConfigError(parsed.data.APP_ENV, extra);
  return parsed.data;
}
