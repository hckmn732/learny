// TanStack Query client of the application (SPEC-3003 EF-4; canevas § 4).
//
// `staleTime` 30 s, `gcTime` 24 h (equal to the maximum age of the persisted cache), two retries
// on a network failure and none on a 4xx (invalid token, accepted-but-refused request): a client
// must never hammer a route that will answer the same way (BR-PLA-08).
import { QueryClient } from '@tanstack/react-query';

import { isAppError } from '@learny/core';

/** Data is fresh for 30 s (canevas § 4). */
export const QUERY_STALE_TIME_MS = 30_000;
/** Unused data is kept 24 h, on device as in the persisted cache (EF-4). */
export const QUERY_GC_TIME_MS = 24 * 60 * 60 * 1000;
/** Two attempts on a network failure, then the screen shows the offline state (EF-4). */
export const QUERY_NETWORK_RETRIES = 2;

/**
 * Retry policy (EF-4): a 4xx is final (`401` is already replayed once by the API client, `429`
 * carries `Retry-After`), a network failure is retried twice, anything else is not retried.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_NETWORK_RETRIES) return false;
  if (!isAppError(error)) return false;
  const status = error.status ?? 0;
  if (status >= 400 && status < 500) return false;
  return status === 0 || status >= 500 || error.code === 'NETWORK_ERROR';
}

/** Builds a client with the defaults of the mobile track (EF-4). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: shouldRetry,
        // The application drives the refresh itself (AppState, NetInfo): TanStack would also
        // refresh on every focus, which doubles the calls of a tab switch (EF-4).
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

/** Client of the process: one cache, shared by the providers and the sign-out purge (EF-6). */
export const appQueryClient: QueryClient = createQueryClient();
