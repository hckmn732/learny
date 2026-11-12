// Wrapper of every `/api/v1/*` route built on a contract (SPEC-201 ET-3). The order of the steps
// is normative: request id, rate limit, origin, authentication, validation, idempotency, service,
// error conversion, output validation, response.
import type { NextRequest } from 'next/server';
import type { z } from 'zod';

import {
  type AnyRoute,
  type RouteBody,
  type RouteOutput,
  type RouteParams,
  type RouteQuery,
} from '@learny/contracts';
import { AppError, clock, isAppError, type Result } from '@learny/core';
import {
  createLogger,
  requestContext,
  runWithRequestContext,
  type LearnyLogger,
} from '@learny/core/server';
import { createServiceContext, type ServiceContext } from '@learny/services';

import { getServerReporter } from '../sentry';

import {
  beginIdempotency,
  finishIdempotency,
  readIdempotencyKey,
  releaseIdempotency,
  IDEMPOTENCY_KEY_HEADER,
} from './idempotency';
import './bootstrap-security';
import { getOriginGuard } from './origin';
import { apiProblemResponse, problemStatus } from './problem';
import { getRateLimiter } from './rate-limit';
import { API_REQUEST_ID_HEADER, resolveApiRequestId } from './request-id';
import { getSessionUser } from './session';
import { invalidInput, queryToObject, validateInput } from './validate';

export const MAX_BODY_BYTES = 1024 * 1024;

export interface RequestContext extends ServiceContext {
  request: NextRequest;
  ip: string;
  /** Headers merged into the answer (`Set-Cookie` of the authentication routes, SPEC-202). */
  responseHeaders: Headers;
}

function mergeResponseHeaders(response: Response, extra: Headers): Response {
  for (const cookie of extra.getSetCookie()) response.headers.append('set-cookie', cookie);
  extra.forEach((value, name) => {
    if (name !== 'set-cookie') response.headers.set(name, value);
  });
  return response;
}

export interface HandlerArgs<R extends AnyRoute> {
  ctx: RequestContext;
  params: RouteParams<R>;
  query: RouteQuery<R>;
  body: RouteBody<R>;
  request: NextRequest;
  logger: LearnyLogger;
}

type Segment = { params: Promise<Record<string, string>> };

function isResult(value: unknown): value is Result<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false;
  if (value.ok === true) return 'value' in value;
  return value.ok === false && 'error' in value;
}

/**
 * Next does not expose the socket address, and passes a client-supplied `X-Forwarded-For` through
 * unchanged. The header is therefore trusted only behind a proxy that sets it (`TRUST_PROXY=true`,
 * Vercel); otherwise the address is unknown and the IP-keyed profiles share one bucket (ADR-0213).
 */
function clientIp(request: Request): string | null {
  if (process.env.TRUST_PROXY !== 'true') return null;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded === undefined || forwarded === '' ? null : forwarded;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'La requête dépasse la taille maximale de 1 Mo.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'La requête dépasse la taille maximale de 1 Mo.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidInput('body', 'Le corps de la requête n’est pas un JSON valide.');
  }
}

function successResponse(route: AnyRoute, requestId: string, status: number, body: unknown) {
  const headers = new Headers({ [API_REQUEST_ID_HEADER]: requestId });
  if (route.auth === 'user') headers.set('cache-control', 'no-store');
  if (status === 204 || body === undefined) return new Response(null, { status, headers });
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

export function routeHandler<R extends AnyRoute>(
  route: R,
  fn: (args: HandlerArgs<R>) => Promise<Result<RouteOutput<R>> | RouteOutput<R>>,
): (request: NextRequest, segment: Segment) => Promise<Response> {
  return async (request, segment) => {
    const requestId = resolveApiRequestId(request.headers.get(API_REQUEST_ID_HEADER));
    const startedAt = clock.now().getTime();
    const responseHeaders = new Headers();
    let userId: string | null = null;
    let reservation: { userId: string; key: string } | null = null;

    const logger = (): LearnyLogger =>
      createLogger({ route: route.id, requestId, ...(userId === null ? {} : { userId }), clock });
    const duration = () => Math.max(0, clock.now().getTime() - startedAt);

    const fail = async (error: unknown): Promise<Response> => {
      const status = problemStatus(error);
      const problem = apiProblemResponse(error, requestId);
      if (reservation !== null) {
        const held = reservation;
        reservation = null;
        try {
          if (status >= 500) await releaseIdempotency(held);
          else await finishIdempotency(held, status, await problem.clone().json());
        } catch (cleanup) {
          logger().error('idempotency cleanup failed', { code: 'INTERNAL_ERROR' }, cleanup);
        }
      }
      const fields = {
        method: request.method,
        status,
        code: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        durationMs: duration(),
      } as const;
      if (status >= 500) logger().error('request failed', fields, error);
      else logger().warn('request failed', fields);
      if (!isAppError(error) || status >= 500) {
        getServerReporter().capture(error, {
          requestId,
          route: route.id,
          ...(userId === null ? {} : { userId }),
        });
      }
      return mergeResponseHeaders(problem, responseHeaders);
    };

    try {
      // 2. origin: before the limiter and before the body is read; a refusal costs no token
      await getOriginGuard().check(request);

      const profile = route.rateLimit ?? 'default';
      const ip = clientIp(request);
      const limit = async (limitedUserId: string | null): Promise<void> => {
        if (profile === 'none') return;
        const decision = await getRateLimiter().consume({
          profile,
          userId: limitedUserId,
          ip,
          routeId: route.id,
        });
        if (decision.limit > 0) {
          responseHeaders.set('ratelimit-limit', String(decision.limit));
          responseHeaders.set('ratelimit-remaining', String(decision.remaining));
        }
        if (!decision.allowed) {
          const seconds = decision.retryAfterSec ?? 1;
          throw new AppError(
            'RATE_LIMITED',
            `Vous avez envoyé trop de requêtes. Réessayez dans ${String(seconds)} s.`,
            { retryAfterSec: seconds },
          );
        }
      };
      // A public route is limited by address before anything else; a learner's bucket needs the
      // learner, so it is taken right after the session is verified (an anonymous call to a
      // protected route is a cheap 401 and is answered by the Auth server's own limits).
      if (route.auth === 'public') await limit(null);

      // 4. authentication
      let email: string | null = null;
      if (route.auth === 'user') {
        const session = await getSessionUser(request);
        if (session === null) {
          throw new AppError(
            'UNAUTHENTICATED',
            'Vous devez être connecté pour effectuer cette action.',
          );
        }
        if (!session.emailConfirmed) {
          throw new AppError(
            'EMAIL_NOT_CONFIRMED',
            'Confirmez votre adresse e-mail pour continuer.',
          );
        }
        userId = session.userId;
        email = session.email;
        await limit(userId);
      }

      // 5. validation
      const rawParams = await segment.params;
      const params = (
        route.params === undefined
          ? undefined
          : validateInput(route.params as z.ZodType, rawParams, 'params')
      ) as RouteParams<R>;
      const query = (
        route.query === undefined
          ? undefined
          : validateInput(
              route.query as z.ZodType,
              queryToObject(new URL(request.url).searchParams),
              'query',
            )
      ) as RouteQuery<R>;
      const body = (
        route.body === undefined
          ? undefined
          : validateInput(route.body as z.ZodType, await readJsonBody(request), 'body')
      ) as RouteBody<R>;

      // 6. idempotency
      if (route.idempotent === true && userId !== null) {
        const key = readIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        const started = await beginIdempotency({
          userId,
          key,
          method: route.method,
          path: route.path,
          params,
          body,
        });
        if (started.state === 'replayed') {
          const replay = successResponse(
            route,
            requestId,
            started.statusCode,
            started.response ?? undefined,
          );
          if (started.statusCode >= 400) {
            replay.headers.set('content-type', 'application/problem+json; charset=utf-8');
          }
          replay.headers.set('idempotent-replayed', 'true');
          logger().info('request replayed', {
            method: request.method,
            status: started.statusCode,
            durationMs: duration(),
          });
          return replay;
        }
        reservation = { userId, key };
      }

      // 7-9. service, errors, output contract
      const response = await runWithRequestContext(
        requestContext(requestId, userId ?? undefined),
        async () => {
          const ctx: RequestContext = {
            ...createServiceContext({ userId, email, requestId, logger: logger(), clock }),
            request,
            ip: ip ?? 'unknown',
            responseHeaders,
          };
          const outcome = await fn({ ctx, params, query, body, request, logger: logger() });
          if (isResult(outcome) && !outcome.ok) throw outcome.error;
          const value: unknown = isResult(outcome)
            ? (outcome as { value: unknown }).value
            : outcome;
          let payload: unknown;
          if (route.output !== null) {
            const checked = (route.output as z.ZodType).safeParse(value);
            if (!checked.success) {
              logger().error('contract_violation', {
                code: 'INTERNAL_ERROR',
                outcome: 'contract_violation',
              });
              throw new Error('contract_violation');
            }
            payload = checked.data;
          }
          return { payload };
        },
      );

      // 10. response
      const answer = mergeResponseHeaders(
        successResponse(route, requestId, route.successStatus, response.payload),
        responseHeaders,
      );
      if (reservation !== null) {
        await finishIdempotency(reservation, route.successStatus, response.payload ?? null);
        reservation = null;
      }
      logger().info('request completed', {
        method: request.method,
        status: route.successStatus,
        durationMs: duration(),
      });
      return answer;
    } catch (error) {
      return fail(error);
    }
  };
}
