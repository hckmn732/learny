// Server-only entry point of the network guard (SPEC-505 ET-6). Never exported by the package
// root: browser code has no business resolving hosts or opening server-side connections.
export {
  MAX_URL_LENGTH,
  PUBLIC_PORTS,
  assertPublicUrl,
  resolvePublicUrl,
} from './assert-public-url';
export type {
  AddressLookup,
  AssertPublicUrlOptions,
  PublicUrlResolution,
  ResolvedAddress,
} from './assert-public-url';
export {
  DEFAULT_ROBOTS_MAX_BYTES,
  DEFAULT_ROBOTS_TIMEOUT_MS,
  LEARNY_BOT_AGENT,
  ROBOTS_CACHE_TTL_MS,
  SAFE_FETCH_MAX_BYTES,
  SAFE_FETCH_MAX_REDIRECTS,
  SAFE_FETCH_TIMEOUT_MS,
  clearRobotsCache,
  isAllowedByRobots,
  safeFetch,
} from './safe-fetch';
export type {
  SafeFetchOptions,
  SafeFetchRequest,
  SafeFetchResponse,
  SafeFetchResult,
  SafeFetchTransport,
} from './safe-fetch';
export { isBlockedIp, isBlockedIpv4, isBlockedIpv6, parseIpv4, parseIpv6 } from './ip-ranges';
