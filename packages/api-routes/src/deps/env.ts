// Single adapter of apps/web to the server configuration (SPEC-009, ET-1, ET-6).
// This is the only file of the application allowed to import `@learny/config/server`
// (enforced by the ESLint boundary in eslint.config.mjs).
import {
  EnvConfigError,
  SERVER_ENV_KEYS,
  parsePublicEnv,
  parseServerEnv,
  type PublicEnv,
  type ServerEnv,
} from '@learny/config/server';

type Env = Readonly<Record<string, string | undefined>>;

/** Number of documented server variables, shown by the SPEC-009 demonstration (EF-7). */
export const SERVER_VARIABLE_COUNT = SERVER_ENV_KEYS.length;

let cached: ServerEnv | undefined;

/**
 * Validates the environment at server startup (called from instrumentation.ts). A production
 * environment that is incomplete throws before any request is served (EF-1, CA-2).
 */
export function assertServerEnv(env: Env = process.env): ServerEnv {
  cached = parseServerEnv(env);
  return cached;
}

/** Typed server configuration, validated once per process. */
export function getServerEnv(env: Env = process.env): ServerEnv {
  cached ??= parseServerEnv(env);
  return cached;
}

/** The six public values a browser may receive (EF-2). */
export function getPublicEnv(env: Env = process.env): PublicEnv {
  return parsePublicEnv(env);
}

/**
 * Presence of the listed secrets in a simulated environment: a boolean per name, never a value
 * (EF-7). Used by the SDD demonstration.
 */
export function secretPresence(env: Env, keys: readonly string[]): Record<string, boolean> {
  const parsed = parseServerEnv(env) as unknown as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, parsed[key] !== undefined]));
}

/**
 * Names of the variables a given environment would refuse, without throwing and without any value:
 * the SDD demo uses it to show a truncated production configuration (EF-7).
 */
export function configurationErrorNames(env: Env): readonly string[] {
  try {
    parseServerEnv(env);
    return [];
  } catch (error) {
    return error instanceof EnvConfigError ? error.names : ['ENV'];
  }
}

/** Test helper: forget the memoised configuration between two environments. */
export function resetServerEnv(): void {
  cached = undefined;
}

export function buildSddConfigDemo() {
  const simulated = {
    APP_ENV: 'local',
    APP_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    ANTHROPIC_API_KEY: 'sk-ant-learny-test-only-sentinel',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-learny-test-only-sentinel',
    VAPID_PRIVATE_KEY: 'vapid-private-learny-test-only-sentinel',
    STRIPE_SECRET_KEY: 'sk_live_learny-test-only-sentinel',
    RESEND_API_KEY: 'resend-learny-test-only-sentinel',
  } as const;
  const parsed = parseServerEnv(simulated);
  let invalidFields: string[] = [];
  try {
    parseServerEnv({
      APP_ENV: 'production',
      ENABLE_SDD_PAGES: 'true',
      DATABASE_URL: 'postgresql://learny:learny-test-only-sentinel@db.example/learny',
    });
  } catch (error) {
    invalidFields = error instanceof EnvConfigError ? [...error.names] : ['ENV'];
  }
  const current = parseServerEnv(process.env);
  const publicEnv = parsePublicEnv(process.env);
  return {
    appEnv: current.APP_ENV,
    modes: {
      llm: current.LLM_MODE,
      stripe: current.STRIPE_MODE,
      email: current.EMAIL_MODE,
      push: current.PUSH_MODE,
    },
    publicConfigured: Object.fromEntries(
      Object.keys(publicEnv).map((key) => [
        key,
        publicEnv[key as keyof typeof publicEnv] !== undefined,
      ]),
    ),
    serverCount: SERVER_ENV_KEYS.length,
    simulated: Object.fromEntries(
      Object.entries(simulated)
        .filter(([key]) => key !== 'APP_ENV')
        .map(([key]) => [key, parsed[key as keyof typeof parsed] !== undefined]),
    ),
    invalidFields,
  };
}
