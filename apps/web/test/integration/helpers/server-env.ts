import {
  EnvConfigError,
  SERVER_ENV_KEYS,
  parsePublicEnv,
  parseServerEnv,
  type PublicEnv,
  type ServerEnv,
} from '@learny/config/server';

type Env = Readonly<Record<string, string | undefined>>;

export const SERVER_VARIABLE_COUNT = SERVER_ENV_KEYS.length;

let cached: ServerEnv | undefined;

export function assertServerEnv(env: Env = process.env): ServerEnv {
  cached = parseServerEnv(env);
  return cached;
}

export function getServerEnv(env: Env = process.env): ServerEnv {
  cached ??= parseServerEnv(env);
  return cached;
}

export function getPublicEnv(env: Env = process.env): PublicEnv {
  return parsePublicEnv(env);
}

export function secretPresence(env: Env, keys: readonly string[]): Record<string, boolean> {
  const parsed = parseServerEnv(env) as unknown as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, parsed[key] !== undefined]));
}

export function configurationErrorNames(env: Env): readonly string[] {
  try {
    parseServerEnv(env);
    return [];
  } catch (error) {
    return error instanceof EnvConfigError ? error.names : ['ENV'];
  }
}

export function resetServerEnv(): void {
  cached = undefined;
}
