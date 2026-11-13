// Single API wrapper of apps/web (docs/architecture/api.md §1, SPEC-010 EF-1/EF-3, ET-2).
// It resolves the request identifier, carries it through AsyncLocalStorage, logs one structured
// line per request, converts errors to application/problem+json and reports unexpected failures
// to Sentry when it is configured. Authentication stays optional until SPEC-201 wires sessions.
import type { NextRequest } from 'next/server';

import type { AnyRoute } from '@learny/contracts';
import {
  ERROR_CATALOG,
  AppError,
  clock,
  isAppError,
  redactText,
  type Clock,
  type ErrorReporter,
  type LearnyLogger,
} from '@learny/core';
import {
  REQUEST_ID_HEADER,
  createLogger,
  requestContext,
  resolveRequestId,
  runWithRequestContext,
  type DestinationStream,
} from '@learny/core/server';

import { getServerReporter } from '../sentry';

import { routeHandler, type HandlerArgs, type RouteOutcome } from './route-handler';

type Env = Readonly<Record<string, string | undefined>>;

/** Minimal session view; SPEC-201 replaces it with the verified Supabase session. */
export interface HandlerAuthResult {
  userId?: string;
}

export type HandlerAuth = (
  request: Request,
) => HandlerAuthResult | null | Promise<HandlerAuthResult | null>;

export interface HandlerLoggerOptions {
  destination?: DestinationStream;
  clock?: Clock;
  env?: Env;
}

export interface HandlerOptions {
  /** Stable route template of the logs, e.g. `/api/v1/health`. Never a raw URL with a query. */
  route: string;
  auth?: HandlerAuth;
  reporter?: ErrorReporter;
  logger?: HandlerLoggerOptions;
}

export interface HandlerContext {
  request: Request;
  requestId: string;
  userId?: string;
  logger: LearnyLogger;
}

export interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId: string;
  errors?: { code?: string; path: string; message: string }[];
}

const AUTH_TITLE = 'Authentification requise';

function catalogEntry(code: string): { status: number; title: string } | undefined {
  return (ERROR_CATALOG as Record<string, { status: number; title: string } | undefined>)[code];
}

function problemStatus(error: unknown): number {
  if (!isAppError(error)) return 500;
  return error.status ?? catalogEntry(error.code)?.status ?? 500;
}

/** Safe problem+json body (RFC 9457): no stack, no exception message for unexpected failures. */
export function problemDetails(error: unknown, requestId: string): ProblemDetails {
  if (!isAppError(error)) {
    return {
      type: 'about:blank',
      title: 'Erreur interne',
      status: 500,
      detail: 'Erreur interne',
      code: 'INTERNAL_ERROR',
      requestId,
    };
  }
  const status = problemStatus(error);
  const entry = catalogEntry(error.code);
  const title = entry?.title ?? (status === 401 ? AUTH_TITLE : 'Erreur');
  // A controlled business detail is useful on 4xx; a server error never echoes its message.
  const detail = status < 500 ? redactText(error.detail) : title;
  return {
    type: 'about:blank',
    title,
    status,
    detail,
    code: error.code,
    requestId,
    ...(error.errors === undefined ? {} : { errors: error.errors }),
  };
}

export function problemResponse(error: unknown, requestId: string): Response {
  const body = problemDetails(error, requestId);
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'no-store',
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

/** Adds the correlation header without altering the body, status or existing headers. */
export function withRequestId(response: Response, requestId: string): Response {
  if (response.headers.get(REQUEST_ID_HEADER) === requestId) return response;
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wraps a route handler. The function returns a `Response`, or any JSON-serialisable value.
 * Every log written inside the call carries the request identifier (EF-1, CA-1).
 */
export function handler<R extends AnyRoute>(
  route: R,
  fn: (args: HandlerArgs<R>) => Promise<RouteOutcome<R>>,
): (
  request: NextRequest,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
export function handler(
  options: HandlerOptions,
  fn: (context: HandlerContext) => Response | object | Promise<Response | object>,
): (request: Request) => Promise<Response>;
export function handler(first: HandlerOptions | AnyRoute, second: unknown): unknown {
  // Contract routes (SPEC-201) go through the route wrapper; the legacy options form (SPEC-010,
  // `/health`) keeps its behaviour unchanged.
  if (isRouteDefinition(first)) {
    return routeHandler(first, second as Parameters<typeof routeHandler>[1]);
  }
  return optionsHandler(
    first,
    second as (context: HandlerContext) => Response | object | Promise<Response | object>,
  );
}

function isRouteDefinition(value: HandlerOptions | AnyRoute): value is AnyRoute {
  return 'id' in value && 'method' in value && 'path' in value;
}

function optionsHandler(
  options: HandlerOptions,
  fn: (context: HandlerContext) => Response | object | Promise<Response | object>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const loggerOptions = options.logger ?? {};
    const currentClock = loggerOptions.clock ?? clock;
    const startedAt = currentClock.now().getTime();
    const reporter = options.reporter ?? getServerReporter();
    let userId: string | undefined;

    const makeLogger = (): LearnyLogger =>
      createLogger({
        route: options.route,
        requestId,
        ...(userId === undefined ? {} : { userId }),
        clock: currentClock,
        ...(loggerOptions.destination === undefined
          ? {}
          : { destination: loggerOptions.destination }),
        ...(loggerOptions.env === undefined ? {} : { env: loggerOptions.env }),
      });

    const duration = (): number => Math.max(0, currentClock.now().getTime() - startedAt);

    try {
      const auth = options.auth;
      if (auth !== undefined) {
        const session = await auth(request);
        if (session === null) {
          const unauthorized = new AppError('UNAUTHORIZED', AUTH_TITLE, { status: 401 });
          makeLogger().warn('request rejected', {
            method: request.method,
            route: options.route,
            status: 401,
            code: 'UNAUTHORIZED',
            durationMs: duration(),
          });
          return problemResponse(unauthorized, requestId);
        }
        userId = session.userId;
      }

      return await runWithRequestContext(requestContext(requestId, userId), async () => {
        const logger = makeLogger();
        const output = await fn({
          request,
          requestId,
          ...(userId === undefined ? {} : { userId }),
          logger,
        });
        const response = output instanceof Response ? output : Response.json(output);
        logger.info('request completed', {
          method: request.method,
          route: options.route,
          status: response.status,
          durationMs: duration(),
        });
        return withRequestId(response, requestId);
      });
    } catch (error) {
      const status = problemStatus(error);
      const logger = makeLogger();
      const fields = {
        method: request.method,
        route: options.route,
        status,
        code: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        durationMs: duration(),
      } as const;
      if (status >= 500) logger.error('request failed', fields, error);
      else logger.warn('request failed', fields);
      // Known client errors are not telemetry incidents; unexpected or server errors are (EF-3).
      if (!isAppError(error) || status >= 500) {
        reporter.capture(error, {
          requestId,
          route: options.route,
          ...(userId === undefined ? {} : { userId }),
        });
      }
      return problemResponse(error, requestId);
    }
  };
}
