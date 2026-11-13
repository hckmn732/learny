// Server-only entry point of the network guard (SPEC-505 ET-6). Never exported by the package
// root: browser code has no business resolving hosts or opening server-side connections.
export { MAX_URL_LENGTH, PUBLIC_PORTS, assertPublicUrl } from './assert-public-url';
export type { AddressLookup, AssertPublicUrlOptions, ResolvedAddress } from './assert-public-url';
export { isBlockedIp, isBlockedIpv4, isBlockedIpv6, parseIpv4, parseIpv6 } from './ip-ranges';
