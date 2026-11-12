// Demonstration routes (SPEC-201 ET-7, CL-10): active only with ENABLE_SDD_PAGES and never in
// production; otherwise they answer a problem+json 404 before any authentication.
import type { NextRequest } from 'next/server';

import { AppError } from '@learny/core';

import { apiProblemResponse } from './problem';
import { resolveApiRequestId } from './request-id';

type Env = Readonly<Record<string, string | undefined>>;

export function devRoutesEnabled(env: Env = process.env): boolean {
  const flag = env.ENABLE_SDD_PAGES;
  return (flag === 'true' || flag === '1') && env.APP_ENV !== 'production';
}

type Segment = { params: Promise<Record<string, string>> };
type RouteFn = (request: NextRequest, segment: Segment) => Promise<Response>;

export function devOnly(inner: RouteFn): RouteFn {
  return (request, segment) => {
    if (devRoutesEnabled()) return inner(request, segment);
    const requestId = resolveApiRequestId(request.headers.get('x-request-id'));
    return Promise.resolve(
      apiProblemResponse(new AppError('NOT_FOUND', 'Ressource introuvable.'), requestId),
    );
  };
}
