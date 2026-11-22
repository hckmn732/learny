// Runtime configuration of the mobile application (SPEC-3001 ET-5, CL-2).
//
// The six `EXPO_PUBLIC_*` variables are read through explicit member expressions so that the Expo
// Babel plugin can inline them at build time; nothing here ever reads a server secret
// (ADR-3004 § 1). Values are validated with Zod once, at start-up, and the screen shows
// « Configuration invalide » with the *keys* at fault — never their value.
import { z } from 'zod';

/** Keys of the public configuration, in the order shown by the error screen. */
export const PUBLIC_ENV_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_WEB_URL',
  'EXPO_PUBLIC_ENABLE_SDD_PAGES',
  'EXPO_PUBLIC_CLOCK_FIXED_AT',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

/** Keys that may be absent (their absence has a defined behaviour). */
export const OPTIONAL_ENV_KEYS: readonly PublicEnvKey[] = ['EXPO_PUBLIC_CLOCK_FIXED_AT'];

export type PublicEnv = Readonly<Record<PublicEnvKey, string | undefined>>;

const absoluteUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL absolue http(s) attendue' },
  );

const isoInstant = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'instant ISO 8601 attendu' });

/** Zod schema of the public configuration (also used by `app.config.ts`). */
export const publicEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: absoluteUrl,
  EXPO_PUBLIC_SUPABASE_URL: absoluteUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  EXPO_PUBLIC_WEB_URL: absoluteUrl,
  EXPO_PUBLIC_ENABLE_SDD_PAGES: z.enum(['0', '1']),
  EXPO_PUBLIC_CLOCK_FIXED_AT: isoInstant.optional(),
});

export interface MobileConfig {
  /** Base of the API, without the `/api/v1` suffix (the client appends it). */
  readonly apiUrl: string;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly webUrl: string;
  readonly enableSddPages: boolean;
  /** Instant of the frozen clock (ADR-0047), or `null` for the system clock. */
  readonly clockFixedAt: string | null;
}

export interface ConfigIssue {
  /** Variable name only: a value is never copied into a message or a log. */
  readonly key: string;
  readonly message: string;
}

export type ConfigParseResult =
  | { readonly ok: true; readonly config: MobileConfig }
  | {
      readonly ok: false;
      readonly missing: readonly string[];
      readonly invalid: readonly ConfigIssue[];
    };

/**
 * Reads the public variables. The member expressions are written literally because the Expo Babel
 * plugin inlines `process.env.EXPO_PUBLIC_*` at build time; the assertion only tells TypeScript
 * what React Native's `process.env` really contains (it is typed `any` there).
 */
export function readPublicEnv(): PublicEnv {
  return {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL as string | undefined,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
    EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL as string | undefined,
    EXPO_PUBLIC_ENABLE_SDD_PAGES: process.env.EXPO_PUBLIC_ENABLE_SDD_PAGES as string | undefined,
    EXPO_PUBLIC_CLOCK_FIXED_AT: process.env.EXPO_PUBLIC_CLOCK_FIXED_AT as string | undefined,
  };
}

function normalize(env: PublicEnv): Record<PublicEnvKey, string | undefined> {
  const out = {} as Record<PublicEnvKey, string | undefined>;
  for (const key of PUBLIC_ENV_KEYS) {
    const value = env[key]?.trim();
    out[key] = value === undefined || value === '' ? undefined : value;
  }
  return out;
}

/** Validates the public configuration (CL-2). Missing and malformed keys are listed by name. */
export function parseConfig(env: PublicEnv): ConfigParseResult {
  const normalized = normalize(env);
  const missing = PUBLIC_ENV_KEYS.filter(
    (key) => normalized[key] === undefined && !OPTIONAL_ENV_KEYS.includes(key),
  );
  const present = Object.fromEntries(
    PUBLIC_ENV_KEYS.flatMap((key) => {
      const value = normalized[key];
      return value === undefined ? [] : [[key, value]];
    }),
  ) as Record<string, string>;

  const parsed = publicEnvSchema.safeParse(present);
  const invalid: ConfigIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        key: String(issue.path[0] ?? ''),
        message: issue.message,
      }));

  if (missing.length > 0 || !parsed.success) {
    return { ok: false, missing, invalid };
  }

  return {
    ok: true,
    config: {
      apiUrl: parsed.data.EXPO_PUBLIC_API_URL.replace(/\/+$/, ''),
      supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''),
      supabaseAnonKey: parsed.data.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      webUrl: parsed.data.EXPO_PUBLIC_WEB_URL.replace(/\/+$/, ''),
      enableSddPages: parsed.data.EXPO_PUBLIC_ENABLE_SDD_PAGES === '1',
      clockFixedAt: parsed.data.EXPO_PUBLIC_CLOCK_FIXED_AT ?? null,
    },
  };
}

/** Human-readable summary of a failed parse: keys only (CL-2). */
export function formatConfigError(result: ConfigParseResult): string {
  if (result.ok) return '';
  const lines: string[] = [];
  if (result.missing.length > 0) lines.push(`Clés manquantes : ${result.missing.join(', ')}`);
  for (const issue of result.invalid) lines.push(`Clé invalide : ${issue.key} (${issue.message})`);
  return lines.join('\n');
}

/** Result of the start-up validation, read by the root layout and by the demo page. */
export const configResult: ConfigParseResult = parseConfig(readPublicEnv());
