// Server environment: the single validation point for every runtime variable (SPEC-009, ET-1).
// Imported through `@learny/config/server` only, never by a client component (ET-6).
import { z } from 'zod';

import { PUBLIC_ENV_KEYS, publicEnvSchema } from './env-public';
import {
  APP_ENVS,
  EMAIL_MODES,
  EnvConfigError,
  LLM_MODES,
  PUSH_MODES,
  STRIPE_MODES,
  isIanaTimeZone,
  isServiceUrl,
  normalizeEnv,
  toEnvIssues,
  type AppEnv,
  type EnvInput,
  type EnvIssue,
} from './env-shared';

/** Server-only variables: never exported by the package root (EF-2, ET-6). */
export const SERVER_ENV_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'APP_ENCRYPTION_KEY',
  'APP_ENCRYPTION_KEY_PREVIOUS',
  'LOG_LEVEL',
  'APP_VERSION',
  'GIT_COMMIT',
  'RATE_LIMIT_IP_SECRET',
  'TRUST_PROXY',
  'ALLOWED_ORIGINS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'DATABASE_POOL_MAX',
  'DB_LOG_QUERIES',
  'LLM_MODE',
  'ANTHROPIC_API_KEY',
  'LLM_LIVE_TESTS',
  'ALLOW_LOCAL_MODELS',
  'VOYAGE_API_KEY',
  'EMBEDDING_DIM',
  'SEARCH_API_KEY',
  'JOBS_MODE',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'INNGEST_DEV',
  'EMAIL_MODE',
  'SMTP_HOST',
  'SMTP_PORT',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'EMAIL_LINK_SECRET',
  'MAILPIT_URL',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'PUSH_MODE',
  'STRIPE_MODE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_HOST_NAME',
  'LEGAL_CGU_VERSION',
  'LEGAL_PRIVACY_VERSION',
  'CLOCK_FIXED_AT',
  'ENABLE_SDD_PAGES',
  'DEEPGRAM_API_KEY',
] as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];

/**
 * Variables of the toolchain (pnpm, Playwright, SDD scripts) kept in `.env.example` but outside the
 * runtime schema: the application never reads them (ET-5, ADR-0226).
 */
export const TOOLING_ENV_KEYS = ['SDD_PUSH', 'E2E_SKIP_BUILD', 'PW_PERF', 'CHROME_PATH'] as const;

/** Standard variables of Node and the CI, never part of the documented application contract. */
export const STANDARD_ENV_KEYS = ['TZ', 'CI', 'PORT', 'NEXT_RUNTIME'] as const;

/** Every documented key: the coherence test compares this list with `.env.example` (CA-3). */
export const RUNTIME_ENV_KEYS: readonly string[] = [...SERVER_ENV_KEYS, ...PUBLIC_ENV_KEYS];

export const DOCUMENTED_ENV_KEYS: readonly string[] = [...RUNTIME_ENV_KEYS, ...TOOLING_ENV_KEYS];

/** Required for `APP_ENV=production` (ET-3). Sentry stays optional unless enabled (ADR-0226). */
export const PRODUCTION_REQUIRED_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'APP_ENCRYPTION_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'RATE_LIMIT_IP_SECRET',
  'EMAIL_LINK_SECRET',
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_HOST_NAME',
] as const;

const STATIC_DEFAULTS = {
  LOG_LEVEL: 'info',
  TRUST_PROXY: 'false',
  DATABASE_POOL_MAX: '10',
  DB_LOG_QUERIES: 'false',
  LLM_LIVE_TESTS: '0',
  ALLOW_LOCAL_MODELS: 'false',
  EMBEDDING_DIM: '1024',
  INNGEST_DEV: '0',
  ENABLE_SDD_PAGES: 'false',
  LEGAL_CGU_VERSION: '2026-11-11',
  LEGAL_PRIVACY_VERSION: '2026-11-11',
} as const;

/** Documented defaults: local and test run without any provider key (EF-1). */
export function envDefaults(appEnv: AppEnv): Record<string, string> {
  const simulated = appEnv === 'local' || appEnv === 'test';
  return {
    ...STATIC_DEFAULTS,
    APP_ENV: appEnv,
    LLM_MODE: simulated ? 'mock' : 'live',
    STRIPE_MODE: appEnv === 'production' ? 'live' : appEnv === 'preview' ? 'test' : 'mock',
    EMAIL_MODE: simulated ? (appEnv === 'test' ? 'memory' : 'smtp') : 'resend',
    PUSH_MODE: simulated ? 'mock' : 'live',
    JOBS_MODE: appEnv === 'test' ? 'inline' : 'inngest',
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

function integer(min: number, max: number) {
  return z.preprocess(
    (value: unknown) =>
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value,
    z.number().int().min(min).max(max),
  );
}

const serviceUrl = z.string().refine(isServiceUrl, 'invalid-url');
const nonEmpty = z.string().min(1);
// A secret keeps its exact bytes: surrounding spaces make it invalid rather than "cleaned" (CL-7).
const secret = z.string().min(1).regex(/^\S+$/, 'no-whitespace');
const encryptionKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'base64')
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'aes-256-key');
const emailAddress = z.string().regex(/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/, 'email');
const emailFrom = z
  .string()
  .regex(/^([^<>]*<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/, 'from');
const isoInstant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, 'instant')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'instant');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date');
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
  RATE_LIMIT_IP_SECRET: z.string().min(32).optional(),
  TRUST_PROXY: booleanString,
  ALLOWED_ORIGINS: z
    .string()
    .refine((value) => value.split(',').every((origin) => isServiceUrl(origin.trim())), 'origins')
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: secret.optional(),
  SUPABASE_JWT_SECRET: secret.optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/\S+$/, 'postgres-url')
    .optional(),
  DATABASE_POOL_MAX: integer(1, 100),
  DB_LOG_QUERIES: booleanString,
  LLM_MODE: enumOf(LLM_MODES),
  ANTHROPIC_API_KEY: secret.optional(),
  LLM_LIVE_TESTS: enumOf(['0', '1']),
  ALLOW_LOCAL_MODELS: booleanString,
  VOYAGE_API_KEY: secret.optional(),
  EMBEDDING_DIM: integer(1, 8192),
  SEARCH_API_KEY: secret.optional(),
  JOBS_MODE: enumOf(['inngest', 'inline']),
  INNGEST_EVENT_KEY: secret.optional(),
  INNGEST_SIGNING_KEY: secret.optional(),
  INNGEST_DEV: enumOf(['0', '1']),
  EMAIL_MODE: enumOf(EMAIL_MODES),
  SMTP_HOST: nonEmpty.optional(),
  SMTP_PORT: integer(1, 65535).optional(),
  EMAIL_FROM: emailFrom.optional(),
  RESEND_API_KEY: secret.optional(),
  EMAIL_LINK_SECRET: z.string().min(32).optional(),
  MAILPIT_URL: serviceUrl.optional(),
  VAPID_PRIVATE_KEY: secret.optional(),
  VAPID_SUBJECT: z
    .string()
    .refine((value) => /^mailto:[^@\s]+@[^@\s]+$/.test(value) || isServiceUrl(value), 'subject')
    .optional(),
  PUSH_MODE: enumOf(PUSH_MODES),
  STRIPE_MODE: enumOf(STRIPE_MODES),
  STRIPE_SECRET_KEY: secret.optional(),
  STRIPE_WEBHOOK_SECRET: secret.optional(),
  STRIPE_PRICE_ID: secret.optional(),
  SENTRY_DSN: serviceUrl.optional(),
  SENTRY_AUTH_TOKEN: secret.optional(),
  LEGAL_ENTITY_NAME: nonEmpty.optional(),
  LEGAL_ENTITY_ADDRESS: nonEmpty.optional(),
  LEGAL_CONTACT_EMAIL: emailAddress.optional(),
  LEGAL_HOST_NAME: nonEmpty.optional(),
  LEGAL_CGU_VERSION: isoDate,
  LEGAL_PRIVACY_VERSION: isoDate,
  CLOCK_FIXED_AT: isoInstant.optional(),
  ENABLE_SDD_PAGES: booleanString,
  DEEPGRAM_API_KEY: secret.optional(),
} as const;

// Public variables are carried by the server configuration object too (mail links, redirects):
// they hold no secret (EF-2) and share the validators of the public schema.
const serverEnvShape = { ...serverFields, ...publicEnvSchema.shape };

const serverEnvBase = z.object(serverEnvShape);

/** Mode matrix and production requirements: replayable in one pass, one error, no value (EF-1, EF-3). */
function checkEnvironment(value: z.infer<typeof serverEnvBase>, ctx: z.RefinementCtx): void {
  const report = (name: string, code: EnvIssue['code']): void => {
    ctx.addIssue({ code: 'custom', path: [name], message: code });
  };
  const field = (name: string): unknown => (value as Record<string, unknown>)[name];

  if (value.APP_ENV === 'test') {
    // A test environment never reaches a provider (CL-3, ADR-0048).
    if (value.LLM_MODE !== 'mock') report('LLM_MODE', 'incompatible');
    if (value.STRIPE_MODE !== 'mock') report('STRIPE_MODE', 'incompatible');
    if (value.EMAIL_MODE !== 'memory') report('EMAIL_MODE', 'incompatible');
    if (value.PUSH_MODE !== 'mock') report('PUSH_MODE', 'incompatible');
    if (value.LLM_LIVE_TESTS !== '0') report('LLM_LIVE_TESTS', 'incompatible');
  }

  if (value.APP_ENV === 'production') {
    for (const name of PRODUCTION_REQUIRED_KEYS) {
      if (field(name) === undefined) report(name, 'missing');
    }
    if (value.LLM_MODE === 'mock') report('LLM_MODE', 'forbidden');
    if (value.STRIPE_MODE === 'mock') report('STRIPE_MODE', 'forbidden');
    if (value.EMAIL_MODE === 'memory') report('EMAIL_MODE', 'forbidden');
    if (value.PUSH_MODE === 'mock') report('PUSH_MODE', 'forbidden');
    if (value.ENABLE_SDD_PAGES) report('ENABLE_SDD_PAGES', 'forbidden');
    if (value.DB_LOG_QUERIES) report('DB_LOG_QUERIES', 'forbidden');
    if (value.JOBS_MODE === 'inline') report('JOBS_MODE', 'forbidden');
    if (value.INNGEST_DEV === '1') report('INNGEST_DEV', 'forbidden');
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
 * Validates the server environment and returns a typed object.
 * `appEnv` overrides `APP_ENV` (startup wiring); production fails on the first run with every
 * missing or invalid variable named, never a value (EF-1, CL-1).
 */
export function parseServerEnv(raw: EnvInput = {}, appEnv?: AppEnv): ServerEnv {
  const input = normalizeEnv(raw);
  const requested = appEnv ?? input.APP_ENV ?? 'local';
  const effectiveEnv = isAppEnv(requested) ? requested : 'local';
  const data: Record<string, string | undefined> = {
    ...envDefaults(effectiveEnv),
    ...input,
    APP_ENV: requested,
  };
  const extra: EnvIssue[] = [];
  const timeZone = input.TZ;
  if (timeZone !== undefined && !isIanaTimeZone(timeZone))
    extra.push({ name: 'TZ', code: 'invalid' });

  const parsed = serverEnvSchema.safeParse(data);
  if (!parsed.success) throw new EnvConfigError(requested, toEnvIssues(parsed.error, extra));
  if (extra.length > 0) throw new EnvConfigError(parsed.data.APP_ENV, extra);
  return parsed.data;
}
