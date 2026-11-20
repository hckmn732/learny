import { ROUTES } from '@learny/contracts';

import { SPECIAL_HANDLERS } from './special';
import { SPECIAL_ROUTE_MANIFEST } from './special/manifest';
import { ROUTE_IMPLEMENTATIONS } from './tables';

/**
 * SPEC-1004 EF-4/EF-6 — expected Next files and their methods, derived from the two tables only.
 * A route present in the registry but in neither table still produces a file entry (that is the
 * drift the check reports), so the value stays a pure function of the committed data.
 */
export interface GeneratedRouteFile {
  /** Path relative to `apps/web/app`, e.g. `api/v1/home/route.ts`. */
  path: string;
  methods: string[];
}

export interface RouteCoverage {
  /** Routes declared in the `ROUTES` registry. */
  registry: number;
  /** Standard implementations (`ROUTE_IMPLEMENTATIONS`). */
  standard: number;
  /** Special handlers (`SPECIAL_HANDLERS`). */
  specials: number;
  /** Distinct Next files the tables describe. */
  files: number;
  /** Next files actually present (same value as `files` when none are scanned). */
  generated: number;
  /** Differences between the tables and the scanned files (0 when the tree matches). */
  drift: number;
  /** Entries sharing one method + path, in the tables or across them. */
  duplicates: number;
  /** Registry keys that neither table implements. */
  uncovered: string[];
  /** Special entries whose method/path drifted from `SPECIAL_ROUTE_MANIFEST`. */
  specialDrift: string[];
}

const ALL_METHODS = ['GET', 'POST', 'PUT'];

interface RouteDescriptor {
  key: string;
  method: string;
  path: string;
}

/** Routes of the registry that have a standard implementation, with their methods. */
function standardRoutes(): RouteDescriptor[] {
  return Object.entries(ROUTE_IMPLEMENTATIONS).map(([key]) => {
    const route = (ROUTES as Record<string, { method: string; path: string } | undefined>)[key];
    if (route === undefined) throw new Error(`route inconnue du registre : ${key}`);
    return { key, method: route.method, path: route.path };
  });
}

/** Special handlers, with their declared method (`ALL` serves GET, POST and PUT). */
function specialRoutes(): RouteDescriptor[] {
  return Object.entries(SPECIAL_HANDLERS).map(([key, handler]) => ({
    key,
    method: handler.method,
    path: handler.path,
  }));
}

function methodsOf(descriptor: RouteDescriptor): string[] {
  return descriptor.method === 'ALL' ? ALL_METHODS : [descriptor.method];
}

/** `api/v1/formations/:fid` → `api/v1/formations/[fid]`, `_dev` → `%5Fdev` (private folder). */
export function filePathOf(path: string): string {
  const segments = path
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => {
      if (segment.startsWith(':')) return `[${segment.slice(1)}]`;
      return segment === '_dev' ? '%5Fdev' : segment;
    });
  return `${segments.join('/')}/route.ts`;
}

export function expectedRouteFiles(): GeneratedRouteFile[] {
  const files = new Map<string, Set<string>>();
  // The Inngest endpoint is mounted directly by `apps/api`; it is not part of the contracts
  // registry, but remains part of the route inventory exposed to migration tooling.
  files.set(filePathOf('/api/inngest'), new Set(ALL_METHODS));
  for (const descriptor of [...standardRoutes(), ...specialRoutes()]) {
    const path = filePathOf(descriptor.path);
    const methods = files.get(path) ?? new Set<string>();
    for (const method of methodsOf(descriptor)) methods.add(method);
    files.set(path, methods);
  }
  return [...files]
    .map(([path, methods]) => ({ path, methods: [...methods].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

/** SPEC-1004 EF-4 — pure comparison of the tables with a scanned list of generated files. */
export function routeCoverage(
  generated: readonly GeneratedRouteFile[] = expectedRouteFiles(),
): RouteCoverage {
  const expected = expectedRouteFiles();
  const byPath = new Map(expected.map((file) => [file.path, file]));
  const actual = new Map(generated.map((file) => [file.path, file]));
  let drift = 0;
  for (const [path, file] of byPath) {
    const other = actual.get(path);
    if (other === undefined) {
      drift += 1;
      continue;
    }
    const same =
      other.methods.length === file.methods.length &&
      other.methods.every((method) => file.methods.includes(method));
    if (!same) drift += 1;
  }
  for (const path of actual.keys()) if (!byPath.has(path)) drift += 1;

  const seen = new Map<string, number>();
  for (const descriptor of [...standardRoutes(), ...specialRoutes()]) {
    for (const method of methodsOf(descriptor)) {
      const id = `${method} ${descriptor.path}`;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const duplicates = [...seen.values()].filter((count) => count > 1).length;

  const implemented = new Set([
    ...ROUTE_IMPLEMENTATIONS_KEY_NAMES(),
    ...Object.keys(SPECIAL_HANDLERS),
  ]);
  const uncovered = Object.keys(ROUTES).filter((key) => !implemented.has(key));

  const specialDrift = SPECIAL_ROUTE_MANIFEST.filter((entry) => {
    const handler = (SPECIAL_HANDLERS as Record<string, { method: string; path: string }>)[
      entry.key
    ];
    return handler === undefined || handler.method !== entry.method || handler.path !== entry.path;
  }).map((entry) => entry.key);

  return {
    registry: Object.keys(ROUTES).length,
    standard: Object.keys(ROUTE_IMPLEMENTATIONS).length,
    specials: Object.keys(SPECIAL_HANDLERS).length,
    files: expected.length,
    generated: actual.size,
    drift,
    duplicates,
    uncovered,
    specialDrift,
  };
}

function ROUTE_IMPLEMENTATIONS_KEY_NAMES(): string[] {
  return Object.keys(ROUTE_IMPLEMENTATIONS);
}
