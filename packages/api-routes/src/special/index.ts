import { authCallbackSpecial } from './auth-callback';
import { DEV_ROUTE_ENTRIES } from './dev-routes';
import { healthSpecial } from './health';
import { inngestSpecial } from './inngest';
import { SPECIAL_ROUTE_MANIFEST } from './manifest';
import { sddCommitCheckSpecial, sddDemoJobSpecial, sddSecretScanSpecial } from './sdd-tools';
import { formationSprintsSpecial } from './sprints';

export type SpecialKey = (typeof SPECIAL_ROUTE_MANIFEST)[number]['key'];

/**
 * SPEC-1004 EF-2 — every route that does not go through the standard path, keyed by its identifier
 * (the registry key when there is one). `Record<SpecialKey, …>` makes a missing entry a typecheck
 * error; the coverage test compares method and path with SPECIAL_ROUTE_MANIFEST (CL-1).
 */
export const SPECIAL_HANDLERS = {
  ...DEV_ROUTE_ENTRIES,
  health: healthSpecial,
  authCallback: authCallbackSpecial,
  formationSprints: formationSprintsSpecial,
  sddDemoJob: sddDemoJobSpecial,
  sddCommitCheck: sddCommitCheckSpecial,
  sddSecretScan: sddSecretScanSpecial,
  inngest: inngestSpecial,
} satisfies Record<SpecialKey, import('./types').SpecialHandler>;

export type { SpecialHandler, SpecialHandlerFn, SpecialSegment } from './types';
