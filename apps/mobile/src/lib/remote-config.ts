// Public configuration served by the API (`config.public`, ADR-4007). The Supabase project, its
// anonymous key and the web URL can come from the server instead of the build: the API URL is the
// only value the application really needs at build time. The `EXPO_PUBLIC_*` values of
// `src/config.ts` remain the fallback, and the last answer is cached so an offline start keeps the
// configuration of the previous session.
import { PublicConfig } from '@learny/contracts';

import type { MobileConfig } from '../config';

export const PUBLIC_CONFIG_PATH = '/api/v1/config/public';
export const PUBLIC_CONFIG_CACHE_KEY = 'learny.publicConfig.v1';

/** Minimal key-value store (AsyncStorage in the application, a map in tests). */
export interface ConfigCache {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface RemoteConfigOptions {
  readonly fetch?: typeof fetch;
  readonly cache?: ConfigCache;
}

export type RemoteConfigSource = 'server' | 'cache' | 'build';

export interface RemoteConfigResult {
  readonly config: MobileConfig;
  readonly source: RemoteConfigSource;
}

/** Reads `GET /api/v1/config/public`; `null` on any network, status or shape failure. */
export async function fetchPublicConfig(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicConfig | null> {
  try {
    const response = await fetchImpl(`${apiUrl.replace(/\/+$/u, '')}${PUBLIC_CONFIG_PATH}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const parsed = PublicConfig.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The build configuration with every value the server provides laid over it. */
export function mergePublicConfig(build: MobileConfig, remote: PublicConfig): MobileConfig {
  return {
    ...build,
    supabaseUrl: remote.supabaseUrl ?? build.supabaseUrl,
    supabaseAnonKey: remote.supabaseAnonKey ?? build.supabaseAnonKey,
    webUrl: remote.webUrl ?? build.webUrl,
  };
}

async function cached(cache: ConfigCache | undefined): Promise<PublicConfig | null> {
  if (cache === undefined) return null;
  try {
    const raw = await cache.getItem(PUBLIC_CONFIG_CACHE_KEY);
    if (raw === null) return null;
    const parsed = PublicConfig.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the configuration at start-up: the server answer first (and cached), then the cached
 * answer of a previous start, then the build values alone.
 */
export async function resolveRemoteConfig(
  build: MobileConfig,
  options: RemoteConfigOptions = {},
): Promise<RemoteConfigResult> {
  const remote = await fetchPublicConfig(build.apiUrl, options.fetch);
  if (remote !== null) {
    try {
      await options.cache?.setItem(PUBLIC_CONFIG_CACHE_KEY, JSON.stringify(remote));
    } catch {
      // A full or unavailable store only loses the offline copy.
    }
    return { config: mergePublicConfig(build, remote), source: 'server' };
  }
  const previous = await cached(options.cache);
  if (previous !== null) return { config: mergePublicConfig(build, previous), source: 'cache' };
  return { config: build, source: 'build' };
}
