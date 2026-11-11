// Per-request correlation context (SPEC-010, EF-1, ET-2, ET-3, CL-6).
// Node's AsyncLocalStorage carries the identifier through asynchronous service calls so that every
// line written during the request shares it, without threading it through each signature.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Bounded, log-safe shape: 1 to 64 characters from a conservative alphabet. Spaces, control
 * characters, quotes and separators that could break a log line are rejected (ET-3, CL-1).
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Reuses an incoming identifier only when it is safe; otherwise a fresh UUID is generated.
 * The untrusted input is never returned (CL-1).
 */
export function resolveRequestId(value: string | null | undefined): string {
  if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value)) return value;
  return randomUUID();
}

/** Runs work in a context; concurrent calls keep independent identifiers (CL-6). */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Context of the current request, or `undefined` outside a request (jobs create their own). */
export function currentRequestContext(): Readonly<RequestContext> | undefined {
  return storage.getStore();
}

/** Context value for a request: the optional user is only added when known. */
export function requestContext(requestId: string, userId?: string): RequestContext {
  return userId === undefined ? { requestId } : { requestId, userId };
}
