// Web pages that now have a native screen (rattrapage mobile, QA 2026-11-25).
//
// `openOnWeb` asks this table first: a page with a native equivalent opens in the application
// instead of the browser. Pages absent from the table (abonnement, pages juridiques, examen blanc
// sans tentative…) keep the web hand-off. Pure module, testable without React Native.

const UUID = '[0-9a-fA-F-]{36}';

interface Rule {
  readonly pattern: RegExp;
  readonly to: (match: RegExpMatchArray) => string;
}

const RULES: readonly Rule[] = [
  { pattern: /^\/formations\/nouvelle\/?$/, to: () => '/programme/cadrage' },
  {
    pattern: new RegExp(`^/formations/(${UUID})/cadrage/?$`),
    to: (m) => `/programme/cadrage?fid=${m[1] ?? ''}`,
  },
  {
    pattern: new RegExp(`^/formations/(${UUID})/programme/?$`),
    to: (m) => `/programme/proposition/${m[1] ?? ''}`,
  },
  {
    pattern: new RegExp(`^/formations/(${UUID})/bilan/?$`),
    to: (m) => `/programme/bilan/${m[1] ?? ''}`,
  },
  {
    pattern: new RegExp(`^/formations/(${UUID})/carte/?$`),
    to: (m) => `/programme/carte/${m[1] ?? ''}`,
  },
  {
    pattern: new RegExp(`^/formations/(${UUID})/groupe/?$`),
    to: (m) => `/programme/groupe/${m[1] ?? ''}`,
  },
  { pattern: new RegExp(`^/formations/(${UUID})/lacunes/?$`), to: () => '/aujourdhui/lacunes' },
  { pattern: /^\/lacunes\/?$/, to: () => '/aujourdhui/lacunes' },
  {
    pattern: new RegExp(`^/formations/(${UUID})/modules/(${UUID})/exercices/(${UUID})/?$`),
    to: (m) => `/exercice/${m[3] ?? ''}?fid=${m[1] ?? ''}&mid=${m[2] ?? ''}`,
  },
  { pattern: /^\/recherche\/?$/, to: () => '/programme/recherche' },
  { pattern: /^\/formations\/depot\/?$/, to: () => '/formations/depot' },
  {
    pattern: new RegExp(`^/formations/(${UUID})/depot/?$`),
    to: (m) => `/formations/${m[1] ?? ''}/depot`,
  },
];

/** The native route of a web path, or `null` when the page stays on the web. */
export function nativeRouteFor(webPath: string): string | null {
  const [beforeHash, hash = ''] = webPath.split('#', 2);
  const [path = '', query = ''] = (beforeHash ?? '').split('?', 2);
  if (path.replace(/\/+$/, '') === '/parametres' && hash === 'modeles') return '/profil/modeles';
  for (const rule of RULES) {
    const match = path.match(rule.pattern);
    if (match === null) continue;
    const target = rule.to(match);
    if (query === '' || target.includes('?')) return target;
    return `${target}?${query}`;
  }
  return null;
}
