import type { HttpMethod } from '@learny/contracts';

/** Path parameters resolved by the host before the handler runs (EF-2). */
export type SpecialSegment = Record<string, string | string[]>;

/** `(request, params) => Response` — the framework-agnostic shape of a special handler. */
export type SpecialHandlerFn = (request: Request, params: SpecialSegment) => Promise<Response>;

/**
 * SPEC-1004 EF-2 — routes that do not go through the standard path (health probe, redirecting
 * authentication callback, development routes, Inngest endpoint). `method: 'ALL'` serves every verb
 * of the path with the same function (Inngest).
 */
export interface SpecialHandler {
  method: HttpMethod | 'ALL';
  path: string;
  handle: SpecialHandlerFn;
}
