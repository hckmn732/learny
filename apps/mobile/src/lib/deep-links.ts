// Internal deep links and universal links of the mobile application (SPEC-3102 EF-8).
//
// A notification always carries a path of the web application (`/formations/…`); SPEC-3501 and the
// push payloads open `learny://…`. Both forms are resolved to one internal path once the
// authentication guard has let the learner in, so a link never opens an unauthenticated screen.
// The parsing stays pure: the tests replay every form without a device, and the navigation
// itself is the caller's business.

export interface DeepLink {
  /** Internal path, always starting with `/` and without the query string. */
  readonly path: string;
  /** Query string of the link, `''` when it has none. */
  readonly query: string;
}

const SCHEMES = ['learny:', 'fr.learny.app:'] as const;

/** Host of the universal link, or `null` when the configured URL carries none. */
export function universalLinkHost(webBaseUrl: string): string | null {
  if (webBaseUrl === '') return null;
  return /^https?:\/\/([^/]+)/i.exec(webBaseUrl)?.[1]?.toLowerCase() ?? null;
}

function split(pathAndQuery: string): DeepLink {
  const index = pathAndQuery.indexOf('?');
  const rawPath = index === -1 ? pathAndQuery : pathAndQuery.slice(0, index);
  const query = index === -1 ? '' : pathAndQuery.slice(index + 1);
  const path = rawPath === '' ? '/' : rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return { path, query };
}

/**
 * Resolves an incoming URL to an internal path:
 * - `learny://aujourdhui`, `learny:///aujourdhui`, `learny://aujourdhui?x=1` → `/aujourdhui` ;
 * - `https://<hôte web>/aujourdhui` → `/aujourdhui` ;
 * - anything else (another application, another host, a bare `http://`) → `null`, never a path.
 */
export function resolveDeepLink(url: string, webBaseUrl: string): DeepLink | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;

  for (const scheme of SCHEMES) {
    if (trimmed.toLowerCase().startsWith(scheme)) {
      const rest = trimmed.slice(scheme.length).replace(/^\/+/, '');
      const [host, ...tail] = rest.split('/');
      // `learny://aujourdhui` puts the first segment in the host: it is a path segment here.
      const pathAndQuery = [host, ...tail].join('/');
      return split(pathAndQuery);
    }
  }

  const host = universalLinkHost(webBaseUrl);
  if (host === null) return null;
  const match = new RegExp(
    `^https?://${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`,
    'i',
  ).exec(trimmed);
  if (match === null) return null;
  return split(match[1] ?? '/');
}

/** True when the link targets one of the authentication screens, which the guard leaves free. */
export function isAuthPath(path: string): boolean {
  return path === '/auth/callback' || path.startsWith('/auth/') || path === '/connexion';
}

/** Shallow parsing of the query string, enough for the parameters the screens read. */
export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (part === '') continue;
    const [name, value = ''] = part.split('=');
    if (name === undefined || name === '') continue;
    out[decodeURIComponent(name)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return out;
}
