// Order and visibility of the provider buttons (SPEC-3402 EF-1, CA-1; ADR-3006 § 3, ADR-3011).
//
// The mockup puts Apple first on iOS and Google first on Android. Google is never displayed
// without Apple: without a usable Apple provider the whole zone is hidden (App Store rule 4.8).
import type { ProviderId } from './types';

export type ProviderPlatform = 'ios' | 'android' | 'web';

const ORDER: Record<ProviderPlatform, readonly ProviderId[]> = {
  ios: ['apple', 'google'],
  android: ['google', 'apple'],
  web: ['google', 'apple'],
};

/** Order of the providers for a platform (EF-1). */
export function providerOrder(platform: ProviderPlatform): readonly ProviderId[] {
  return ORDER[platform];
}

/** Providers to display: none when Apple is unavailable, the platform order otherwise. */
export function visibleProviders(
  platform: ProviderPlatform,
  appleAvailable: boolean,
): readonly ProviderId[] {
  if (!appleAvailable) return [];
  return providerOrder(platform);
}
