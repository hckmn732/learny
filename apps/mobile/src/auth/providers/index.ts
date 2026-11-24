// Registry of the provider adapters (SPEC-3402 ET-1, ET-3).
//
// One import for the screens: the e2e build is the only one that swaps the adapters, and it does so
// through a public flag inlined at build time (`EXPO_PUBLIC_SDD_OAUTH_MOCK`), never at runtime.
import { appleProvider } from './apple';
import { googleProvider } from './google';
import { createMockProvider } from './mock';
import type { ProviderAdapter, ProviderId } from './types';

export type { ProviderAdapter, ProviderId, ProviderName, ProviderResult } from './types';
export { providerName } from './types';

/** True in an e2e build only (ET-3). */
export function isMockProviderEnabled(): boolean {
  return (process.env.EXPO_PUBLIC_SDD_OAUTH_MOCK as string | undefined) === '1';
}

/** Adapter of `id` for this build. */
export function providerFor(id: ProviderId): ProviderAdapter {
  if (isMockProviderEnabled()) return createMockProvider(id);
  return id === 'apple' ? appleProvider : googleProvider;
}
