// TanStack Query keys: `['<domaine>', id]` (SPEC-201 ET-10, ADR-0063). One factory per domain,
// added by the specification that introduces its first query.
type Key = readonly [string, ...unknown[]];

function key(domain: string, id?: string | number): Key {
  return id === undefined ? [domain] : [domain, id];
}

export const qk = {
  devItems: (cursor?: string): Key => key('dev-items', cursor),
  health: (): Key => key('health'),
} as const;
