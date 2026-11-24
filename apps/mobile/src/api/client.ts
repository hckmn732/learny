// Instance of `@learny/api-client` for the mobile application (SPEC-3003 EF-2, EF-3; ADR-1005,
// ADR-3008 § 3).
//
// - base URL: `EXPO_PUBLIC_API_URL` + `/api/v1`;
// - transport: `fetch` of `expo/fetch`, the only implementation that streams `response.body`
//   (ET-5, canevas § 6) — never the global fetch of React Native;
// - headers: `Authorization: Bearer <jeton>`, a fresh `X-Request-Id` (UUID v4) and
//   `Accept-Language: fr` on every attempt; no cookie, no `Origin` (a native client sends neither);
// - `401`: one renewal through the serialised `refreshSessionOnce()`, then one replay only.
//
// This module is pure: the transport and the token source are injected, so the unit tests replay
// the whole contract without a native runtime nor a network.
import { createApiClient, type ApiClient } from '@learny/api-client';

import { uuidV4 } from './uuid';

export interface MobileTokenSource {
  /** Current access token, `null` when signed out. */
  get: () => string | null;
  /** One renewal, shared by every concurrent caller; `false` when refused (ET-2). */
  refresh: () => Promise<boolean>;
}

export interface MobileApiClientOptions {
  /** Base of the API, without `/api/v1` (ET-2). */
  apiUrl: string;
  token: MobileTokenSource;
  /** Transport, `expo/fetch` in the application (ET-5). */
  fetchImpl?: typeof fetch;
  /** Called once when a renewal is refused: local sign-out and purge (EF-3). */
  onSessionExpired?: () => void;
  /** Source of `X-Request-Id`; `expo-crypto` in the application. */
  newRequestId?: () => string;
}

/**
 * Identifier of the request (`X-Request-Id`, EF-2). The application injects `randomUUID` of
 * `expo-crypto`; the pure fallback keeps this module usable without a native runtime.
 */
export function newRequestId(): string {
  return uuidV4();
}

/** Headers every request of the application carries (EF-2, BR-PLA-08). */
export function defaultRequestHeaders(newRequestId: () => string): Record<string, string> {
  return { 'X-Request-Id': newRequestId(), 'Accept-Language': 'fr' };
}

/** Builds the client of `/api/v1` used by the application (EF-2). */
export function createMobileApiClient(options: MobileApiClientOptions): ApiClient {
  const nextRequestId = options.newRequestId ?? newRequestId;

  return createApiClient({
    baseUrl: `${options.apiUrl}/api/v1`,
    ...(options.fetchImpl === undefined ? {} : { fetch: options.fetchImpl }),
    getAccessToken: () => options.token.get(),
    refreshAccessToken: async () => {
      const renewed = await options.token.refresh();
      if (!renewed) {
        // EF-3, CL-2 — the renewal was refused: local sign-out, purge, sign-in screen.
        options.onSessionExpired?.();
        return null;
      }
      return options.token.get();
    },
    headers: () => defaultRequestHeaders(nextRequestId),
  });
}
