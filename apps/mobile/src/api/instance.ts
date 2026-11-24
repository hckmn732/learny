// Start-up instance of the API client (SPEC-3003 EF-2, ET-5).
//
// The only module that binds the pure client to the native world: `expo/fetch` for the transport,
// `expo-crypto` for the request identifier and the session token of `src/auth/session-token.ts`.
// Imported once by `app/_layout.tsx`; the screens read the client through `src/api/registry.ts`.
import { randomUUID } from 'expo-crypto';

import { getSessionToken, refreshSessionOnce } from '../auth/session-token';
import { configResult } from '../config';

import { createMobileApiClient } from './client';
import { setApiClient } from './registry';
import { nativeFetch } from './transport';

/** Base of the API, without `/api/v1`; empty when the configuration is invalid (CL-2). */
export const apiUrl: string = configResult.ok ? configResult.config.apiUrl : '';

/** Client of `/api/v1` of the application (EF-2). */
export const apiClient = createMobileApiClient({
  apiUrl,
  token: { get: getSessionToken, refresh: refreshSessionOnce },
  fetchImpl: nativeFetch,
  newRequestId: () => randomUUID(),
});

setApiClient(apiClient);
