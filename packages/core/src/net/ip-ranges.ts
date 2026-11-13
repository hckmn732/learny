// Address classification used by the anti-SSRF guard (SPEC-505 ET-6, ADR-0159 point 2).
// Every private, loopback, link-local, multicast, reserved, CGNAT and metadata range of IPv4 and
// IPv6 is refused, including IPv4 addresses embedded in IPv6 (mapped, 6to4, Teredo, NAT64).
import { isIP } from 'node:net';

interface Cidr4 {
  readonly base: readonly [number, number, number, number];
  readonly prefix: number;
}

const BLOCKED_IPV4: readonly Cidr4[] = [
  { base: [0, 0, 0, 0], prefix: 8 }, // "this" network
  { base: [10, 0, 0, 0], prefix: 8 }, // private
  { base: [100, 64, 0, 0], prefix: 10 }, // CGNAT
  { base: [127, 0, 0, 0], prefix: 8 }, // loopback
  { base: [169, 254, 0, 0], prefix: 16 }, // link-local, cloud metadata
  { base: [172, 16, 0, 0], prefix: 12 }, // private
  { base: [192, 0, 0, 0], prefix: 24 }, // IETF protocol assignments
  { base: [192, 0, 2, 0], prefix: 24 }, // documentation
  { base: [192, 88, 99, 0], prefix: 24 }, // 6to4 relay anycast
  { base: [192, 168, 0, 0], prefix: 16 }, // private
  { base: [198, 18, 0, 0], prefix: 15 }, // benchmarking
  { base: [198, 51, 100, 0], prefix: 24 }, // documentation
  { base: [203, 0, 113, 0], prefix: 24 }, // documentation
  { base: [224, 0, 0, 0], prefix: 4 }, // multicast
  { base: [240, 0, 0, 0], prefix: 4 }, // reserved, broadcast
];

/** Decimal dotted quad → four octets, or null. */
export function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    values.push(value);
  }
  return [values[0] as number, values[1] as number, values[2] as number, values[3] as number];
}

function inCidr4(address: readonly [number, number, number, number], cidr: Cidr4): boolean {
  let remaining = cidr.prefix;
  for (let index = 0; index < 4; index += 1) {
    const bits = Math.min(8, remaining);
    if (bits === 0) return true;
    const mask = (0xff << (8 - bits)) & 0xff;
    if (((address[index] as number) & mask) !== ((cidr.base[index] as number) & mask)) return false;
    remaining -= bits;
  }
  return true;
}

/** True for every IPv4 address the server must never contact. */
export function isBlockedIpv4(
  address: string | readonly [number, number, number, number],
): boolean {
  const parsed = typeof address === 'string' ? parseIpv4(address) : address;
  if (parsed === null) return true;
  return BLOCKED_IPV4.some((cidr) => inCidr4(parsed, cidr));
}

/** Expands an IPv6 literal (without brackets) into its eight 16-bit groups. */
export function parseIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (text === '') return null;

  // A trailing dotted quad is an embedded IPv4 address written in decimal.
  let tailGroups: number[] = [];
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon === -1) return null;
    const ipv4 = parseIpv4(text.slice(lastColon + 1));
    if (ipv4 === null) return null;
    tailGroups = [(ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]];
    text = text.slice(0, lastColon + 1);
    // Keep a trailing `::` (it is the compression marker); drop only the single separator colon
    // of `::ffff:` / `2001:db8:` forms.
    if (!text.endsWith('::') && text.endsWith(':')) text = text.slice(0, -1);
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parseGroups = (half: string): number[] | null => {
    if (half === '') return [];
    const result: number[] = [];
    for (const group of half.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      result.push(Number.parseInt(group, 16));
    }
    return result;
  };
  const head = parseGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? parseGroups(halves[1] ?? '') : [];
  if (head === null || tail === null) return null;

  const explicit = [...head, ...tail, ...tailGroups];
  const target = 8;
  const zeros = target - explicit.length;
  if (halves.length === 1) {
    return explicit.length === target ? explicit : null;
  }
  if (zeros < 0) return null;
  return [...head, ...new Array<number>(zeros).fill(0), ...tail, ...tailGroups];
}

function isBlockedIpv6Groups(groups: readonly number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const allZero = groups.every((group) => group === 0);
  if (allZero) return true; // ::
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0 &&
    g6 === 0 &&
    g7 === 1
  ) {
    return true; // ::1
  }

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96): classify the embedded address.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    const embedded = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff] as const;
    return isBlockedIpv4(embedded);
  }

  // NAT64 well-known prefix and local-use prefix.
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0) {
    if (g4 === 0 && g5 === 0) {
      const embedded = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff] as const;
      return isBlockedIpv4(embedded);
    }
    if (g4 === 1) return true;
  }

  // 6to4 (2002::/16): classify the embedded IPv4 address.
  if (g0 === 0x2002) {
    const embedded = [g1 >> 8, g1 & 0xff, g2 >> 8, g2 & 0xff] as const;
    return isBlockedIpv4(embedded);
  }

  // Teredo (2001::/32): both the server and the obfuscated client address are checked.
  if (g0 === 0x2001 && g1 === 0) {
    const server = [g2 >> 8, g2 & 0xff, g3 >> 8, g3 & 0xff] as const;
    const client = [
      (g6 ^ 0xffff) >> 8,
      (g6 ^ 0xffff) & 0xff,
      (g7 ^ 0xffff) >> 8,
      (g7 ^ 0xffff) & 0xff,
    ] as const;
    return isBlockedIpv4(server) || isBlockedIpv4(client);
  }

  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // deprecated site-local fec0::/10
  if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation 2001:db8::/32
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard-only 100::/64
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x0010) return true; // ORCHID 2001:10::/28
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x0020) return true; // ORCHIDv2 2001:20::/28

  return false;
}

/** True for every IPv6 address (and IPv4-mapped form) the server must never contact. */
export function isBlockedIpv6(address: string): boolean {
  const groups = parseIpv6(address);
  if (groups === null) return true;
  return isBlockedIpv6Groups(groups);
}

/** True when a literal IP (v4 or v6) is not publicly routable. Unknown input is blocked. */
export function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}
