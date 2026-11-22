// Transport of the mobile API client (SPEC-3003 EF-2, ET-5).
//
// The global `fetch` of React Native does not expose `response.body` as a stream, so the SSE of
// the tutor would never arrive; `fetch` of `expo/fetch` is the only admitted implementation
// (canevas § 6, ET-5). No polyfill: a runtime without it is a build failure, not a silent fallback.
import { fetch as expoFetch } from 'expo/fetch';

/** `expo/fetch`, typed as the standard `fetch` expected by `@learny/api-client`. */
export const nativeFetch: typeof fetch = expoFetch;
