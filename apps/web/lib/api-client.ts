// Typed client of /api/v1 for the browser (SPEC-006 `apiFetch`, SPEC-201 `callApi` and `api`).
import { z } from 'zod';

import { ROUTES, type AnyRoute, type RouteInput, type RouteOutput } from '@learny/contracts';
import { AppError, ERROR_CATALOG, type ErrorCode } from '@learny/core';

export const API_BASE = '/api/v1';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest<TInput, TOutput> {
  method: ApiMethod;
  /** Path under /api/v1, starting with `/` (e.g. `/health`). */
  path: string;
  /** JSON body, validated by `input` before anything is sent. */
  body?: TInput;
  input?: z.ZodType<TInput>;
  /** Schema of a successful response; for 204 it receives `undefined` (use `z.undefined()`). */
  output: z.ZodType<TOutput>;
  signal?: AbortSignal;
  /** Injectable transport (tests, demonstration); defaults to the global fetch. */
  fetch?: typeof fetch;
}

// RFC 9457 problem details, as produced by the API (docs/architecture/api.md §1).
const ProblemDetails = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  code: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~%/]*(\?[A-Za-z0-9\-._~%&=+,]*)?$/;

function codeForStatus(status: number): ErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

function headerRequestId(response: Response): string | undefined {
  return response.headers.get('x-request-id') ?? undefined;
}

/** Seconds of `Retry-After`, when the answer carries one (SPEC-601 EF-9). */
function headerRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

function withResponseHeaders(
  status: number,
  requestId: string | undefined,
  retryAfterSec: number | undefined,
): { status: number; requestId?: string; retryAfterSec?: number } {
  return {
    status,
    ...(requestId === undefined ? {} : { requestId }),
    ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
  };
}

async function readJson(response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await response.text();
    return { ok: true, value: text === '' ? undefined : (JSON.parse(text) as unknown) };
  } catch {
    return { ok: false };
  }
}

async function toAppError(response: Response): Promise<AppError> {
  const contentType = response.headers.get('content-type') ?? '';
  const fallbackRequestId = headerRequestId(response);
  if (contentType.includes('application/problem+json')) {
    const json = await readJson(response);
    const problem = json.ok ? ProblemDetails.safeParse(json.value) : null;
    if (problem?.success === true) {
      const p = problem.data;
      const code = p.code ?? codeForStatus(response.status);
      const detail = p.detail ?? p.title ?? ERROR_CATALOG[codeForStatus(response.status)].title;
      const extra = withResponseHeaders(
        response.status,
        p.requestId ?? fallbackRequestId,
        headerRetryAfter(response),
      );
      return new AppError(
        code,
        detail,
        p.errors === undefined ? extra : { ...extra, errors: p.errors },
      );
    }
    return new AppError(
      'INVALID_RESPONSE',
      ERROR_CATALOG.INVALID_RESPONSE.title,
      withResponseHeaders(response.status, fallbackRequestId, headerRetryAfter(response)),
    );
  }
  const code = codeForStatus(response.status);
  return new AppError(
    code,
    ERROR_CATALOG[code].title,
    withResponseHeaders(response.status, fallbackRequestId, headerRetryAfter(response)),
  );
}

/**
 * Sends one request and decodes it. Never retries (a mutation must not be replayed implicitly).
 * Every failure is an `AppError`: validation, network, error response or unexpected body.
 */
export async function apiFetch<TInput, TOutput>(
  req: ApiRequest<TInput, TOutput>,
): Promise<TOutput> {
  if (!SAFE_PATH.test(req.path) || req.path.includes('..')) {
    throw new AppError('VALIDATION_FAILED', 'Chemin d’API invalide.');
  }

  const hasBody = req.body !== undefined;
  let payload: string | undefined;
  if (hasBody) {
    let value: unknown = req.body;
    if (req.input !== undefined) {
      const parsed = req.input.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', ERROR_CATALOG.VALIDATION_FAILED.title, {
          errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      value = parsed.data;
    }
    payload = JSON.stringify(value);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method: req.method, headers, credentials: 'same-origin' };
  if (payload !== undefined) init.body = payload;
  if (req.signal !== undefined) init.signal = req.signal;

  const send = req.fetch ?? fetch;
  let response: Response;
  try {
    response = await send(`${API_BASE}${req.path}`, init);
  } catch (cause) {
    throw new AppError('NETWORK_ERROR', 'Le serveur est injoignable. Vérifiez votre connexion.', {
      cause,
    });
  }

  if (!response.ok) throw await toAppError(response);

  const requestId = headerRequestId(response);
  let value: unknown;
  if (response.status === 204) {
    value = undefined;
  } else {
    const json = await readJson(response);
    if (!json.ok) {
      throw new AppError(
        'INVALID_RESPONSE',
        ERROR_CATALOG.INVALID_RESPONSE.title,
        withResponseHeaders(response.status, requestId, headerRetryAfter(response)),
      );
    }
    value = json.value;
  }
  const parsed = req.output.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'INVALID_RESPONSE',
      ERROR_CATALOG.INVALID_RESPONSE.title,
      withResponseHeaders(response.status, requestId, headerRetryAfter(response)),
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// SPEC-201: client built on the route contracts.

/** Error of a call through `callApi`: HTTP status, business code, request reference (EF-9). */
export class ApiError extends AppError {
  override readonly name = 'ApiError';
  declare readonly status: number;
}

export interface CallOptions {
  /** Reused as is when given; otherwise generated once per call for an idempotent route. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Injectable transport (tests, demonstration); defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Network retries of an idempotent call, with the same key (default 2). */
  networkRetries?: number;
}

function toApiError(error: AppError): ApiError {
  return new ApiError(error.code, error.detail, {
    status: error.status ?? 0,
    ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    ...(error.errors === undefined ? {} : { errors: error.errors }),
  });
}

function buildUrl(
  route: AnyRoute,
  input: { params?: Record<string, string | number>; query?: Record<string, unknown> },
): string {
  const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = input.params?.[name];
    if (value === undefined) {
      throw new ApiError('VALIDATION_FAILED', `Paramètre « ${name} » manquant.`, { status: 0 });
    }
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(name, String(item as string | number | boolean));
    }
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}

/** Calls a route of the registry; returns the typed output or throws an `ApiError`. */
export async function callApi<R extends AnyRoute>(
  route: R,
  input: RouteInput<R>,
  options: CallOptions = {},
): Promise<RouteOutput<R>> {
  const typed = input as {
    params?: Record<string, string | number>;
    query?: Record<string, unknown>;
    body?: unknown;
  };
  const url = buildUrl(route, typed);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method: route.method, headers, credentials: 'same-origin' };
  if (typed.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(typed.body);
  }
  if (options.signal !== undefined) init.signal = options.signal;
  if (route.idempotent === true || options.idempotencyKey !== undefined) {
    // An explicit key is also sent to a route that handles idempotency itself (SPEC-206 uploads).
    headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
  }

  const send = options.fetch ?? fetch;
  const retries = route.idempotent === true ? (options.networkRetries ?? 2) : 0;
  let response: Response | undefined;
  for (let attempt = 0; response === undefined; attempt += 1) {
    try {
      response = await send(url, init);
    } catch (cause) {
      // The same Idempotency-Key is sent again: the server never runs the service twice.
      if (attempt < retries && options.signal?.aborted !== true) continue;
      throw new ApiError('NETWORK_ERROR', 'Le serveur est injoignable. Vérifiez votre connexion.', {
        status: 0,
        cause,
      });
    }
  }

  if (!response.ok) throw toApiError(await toAppError(response));
  const requestId = headerRequestId(response);
  const status = response.status;
  const invalid = () =>
    new ApiError('INVALID_RESPONSE', ERROR_CATALOG.INVALID_RESPONSE.title, {
      status,
      ...(requestId === undefined ? {} : { requestId }),
    });

  if (route.output === null || status === 204) return undefined as RouteOutput<R>;
  const json = await readJson(response);
  if (!json.ok) throw invalid();
  const parsed = (route.output as z.ZodType).safeParse(json.value);
  if (!parsed.success) throw invalid();
  return parsed.data as RouteOutput<R>;
}

type ApiRoutes = typeof ROUTES;

export type Api = {
  [K in keyof ApiRoutes]: (
    input: RouteInput<ApiRoutes[K]>,
    options?: CallOptions,
  ) => Promise<RouteOutput<ApiRoutes[K]>>;
};

/** `api.devEcho({ body })`, `api.devItems({ query })`… one function per registered route. */
export const api = Object.fromEntries(
  Object.entries(ROUTES).map(([name, route]) => [
    name,
    (input: never, options?: CallOptions) => callApi(route as AnyRoute, input, options),
  ]),
) as unknown as Api;
