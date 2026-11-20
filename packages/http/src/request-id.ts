// Request identifier of /api/v1 (SPEC-201 EF-2, CL-8): an incoming `X-Request-Id` is reused only
// when it is short and made of letters, digits and dashes; anything else is replaced by a UUID.
import { randomUUID } from 'node:crypto';

export const API_REQUEST_ID_HEADER = 'x-request-id';
export const API_REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function resolveApiRequestId(value: string | null | undefined): string {
  if (typeof value === 'string' && API_REQUEST_ID_PATTERN.test(value)) return value;
  return randomUUID();
}
