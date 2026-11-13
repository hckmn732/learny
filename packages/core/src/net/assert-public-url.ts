// Public-address guard shared by every server-side retrieval (SPEC-505 ET-6, ADR-0159 points 1,
// 2 and 7). `safeFetch` (SPEC-510) reuses this check before each connection and redirection.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { AppError } from '../errors';

import { isBlockedIp } from './ip-ranges';

/** Longest URL accepted (ADR-0159 point 1). */
export const MAX_URL_LENGTH = 2048;

/** Ports reachable without the local-model exception. */
export const PUBLIC_PORTS = new Set(['', '80', '443']);

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type AddressLookup = (hostname: string) => Promise<readonly ResolvedAddress[]>;

export interface AssertPublicUrlOptions {
  /**
   * Local-model exception of ADR-0159 point 7: private hosts and any port are accepted. Reserved
   * to `ALLOW_LOCAL_MODELS=true`; the caller owns that check.
   */
  allowPrivate?: boolean;
  /** DNS seam of the tests; production resolves every address with `dns.lookup`. */
  lookup?: AddressLookup;
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function invalid(detail: string, cause?: unknown): AppError {
  return new AppError('URL_INVALID', detail, {
    status: 422,
    ...(cause === undefined ? {} : { cause }),
  });
}

function blocked(detail: string): AppError {
  return new AppError('URL_BLOCKED_HOST', detail, { status: 422 });
}

function hostOf(url: URL): string {
  const host = url.hostname.toLowerCase();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function isLocalHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.')) return true;
  if (!hostname.includes('.')) return true; // single-label name, resolved by local search domains
  return LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

async function defaultLookup(hostname: string): Promise<readonly ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, order: 'verbatim' });
}

export interface PublicUrlResolution {
  url: URL;
  /** Addresses checked for this host; a literal IP appears as itself, an allowed private host is empty. */
  addresses: readonly ResolvedAddress[];
}

/**
 * Parses and validates a user-supplied URL and returns the addresses that were checked, so
 * `safeFetch` can pin its connection on exactly the verified address (ADR-0159 point 2).
 */
export async function resolvePublicUrl(
  input: string,
  options: AssertPublicUrlOptions = {},
): Promise<PublicUrlResolution> {
  const raw = input.trim();
  if (raw === '' || raw.length > MAX_URL_LENGTH) {
    throw invalid('L’adresse est vide ou dépasse 2048 caractères.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw invalid('L’adresse n’est pas une URL valide.', error);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw invalid('Seules les adresses http et https sont acceptées.');
  }
  if (url.username !== '' || url.password !== '') {
    throw invalid('L’adresse ne doit pas contenir d’identifiants.');
  }

  const allowPrivate = options.allowPrivate === true;
  if (allowPrivate) return { url, addresses: [] };

  if (!PUBLIC_PORTS.has(url.port)) {
    throw invalid('Seuls les ports 80 et 443 sont acceptés.');
  }

  const hostname = hostOf(url);
  if (hostname === '') throw invalid('L’adresse ne contient pas d’hôte.');
  if (isIP(hostname) === 0 && isLocalHostname(hostname)) {
    throw blocked('Les hôtes locaux ne sont pas autorisés.');
  }
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) throw blocked('Cette adresse réseau n’est pas publique.');
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }

  const lookup = options.lookup ?? defaultLookup;
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw blocked('L’hôte n’a pas pu être résolu vers une adresse publique.');
  }
  if (addresses.length === 0) throw blocked('L’hôte ne résout vers aucune adresse.');
  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw blocked('L’hôte résout vers une adresse réseau non publique.');
  }
  return { url, addresses };
}

/**
 * Parses and validates a user-supplied URL. Without `allowPrivate`, the host name and **every**
 * address it resolves to must be public; a DNS failure is refused rather than retried elsewhere.
 */
export async function assertPublicUrl(
  input: string,
  options: AssertPublicUrlOptions = {},
): Promise<URL> {
  return (await resolvePublicUrl(input, options)).url;
}
