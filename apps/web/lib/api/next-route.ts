// SPEC-1004 ET-3 — the only module a generated route file imports. `nextRoute(id)` resolves the
// contract and its implementation from @learny/api-routes, `nextSpecial(key)` returns the special
// handler; a route.ts therefore contains no logic of its own (CA-4).
export { nextRoute, nextSpecial } from '@learny/api-routes';
