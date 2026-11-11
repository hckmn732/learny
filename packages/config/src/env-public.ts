// Public environment: the only values a browser may receive (SPEC-009, EF-2).
// This module is exported by the package root and safe to bundle client-side: it holds names and
// validation rules only, never a server value.
import { z } from 'zod';

import {
  EnvConfigError,
  isServiceUrl,
  normalizeEnv,
  toEnvIssues,
  type EnvInput,
} from './env-shared';

/** Exact white list of `NEXT_PUBLIC_*` variables (EF-2). */
export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

const serviceUrl = z.string().refine(isServiceUrl, 'invalid-url');
const publicToken = z.string().min(1);

export const publicEnvSchema = z.strictObject({
  NEXT_PUBLIC_APP_URL: serviceUrl.optional(),
  NEXT_PUBLIC_SUPABASE_URL: serviceUrl.optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicToken.optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicToken.optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publicToken.optional(),
  NEXT_PUBLIC_SENTRY_DSN: serviceUrl.optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Keeps the six white-listed keys and nothing else: a stray `NEXT_PUBLIC_*` variable can never
 * reach the browser through this object (EF-2).
 */
export function parsePublicEnv(raw: EnvInput = {}): PublicEnv {
  const input = normalizeEnv(raw);
  const picked: Record<string, string> = {};
  for (const key of PUBLIC_ENV_KEYS) {
    const value = input[key];
    if (value !== undefined) picked[key] = value;
  }
  const parsed = publicEnvSchema.safeParse(picked);
  if (!parsed.success) throw new EnvConfigError('publique', toEnvIssues(parsed.error));
  return parsed.data;
}
