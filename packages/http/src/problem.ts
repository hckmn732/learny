// RFC 9457 answers of /api/v1 (SPEC-201 EF-1, EF-2).
import { AppError, toProblem } from '@learny/core';

import { API_REQUEST_ID_HEADER } from './request-id';

export function apiProblemResponse(error: unknown, requestId: string): Response {
  const body = toProblem(error, requestId);
  const headers = new Headers({
    'content-type': 'application/problem+json; charset=utf-8',
    'cache-control': 'no-store',
    [API_REQUEST_ID_HEADER]: requestId,
  });
  if (error instanceof AppError && error.retryAfterSec !== undefined && body.status < 500) {
    headers.set('retry-after', String(error.retryAfterSec));
  }
  return new Response(JSON.stringify(body), { status: body.status, headers });
}

/** Typed shortcut for the numeric status of an error. */
export function problemStatus(error: unknown): number {
  return toProblem(error, 'status-only').status;
}
