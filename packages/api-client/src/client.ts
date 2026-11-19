// Typed client of /api/v1 (SPEC-006 `apiFetch`, SPEC-201 `callApi` and `api`; SPEC-1002 EF-1).
// Shared by every client of the API — browser today, mobile tomorrow (ADR-1004/ADR-1007):
// `createApiClient` parameterises the base, the transport, a header provider and a single
// 401 replay; the module-level exports are bound to the default web client of `/api/v1`.
import type { AnyRoute, RouteInput, RouteOutput } from '@learny/contracts/define-route';
import type { ROUTES } from '@learny/contracts/routes';
import { AppError, ERROR_CATALOG, type ErrorCode } from '@learny/core';

/**
 * Minimal schema surface used by the client: any Zod schema satisfies it. Declaring it here keeps
 * the Zod runtime out of the initial browser bundle (the route registry, and therefore Zod, is
 * loaded on the first API call only — SPEC-804).
 */
export interface SchemaIssue {
  path: readonly unknown[];
  message: string;
}

export interface Schema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: readonly SchemaIssue[] } };
}

export const API_BASE = '/api/v1';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest<TInput, TOutput> {
  method: ApiMethod;
  /** Path under the base (`/api/v1` by default), starting with `/` (e.g. `/health`). */
  path: string;
  /** JSON body, validated by `input` before anything is sent. */
  body?: TInput;
  input?: Schema<TInput>;
  /** Schema of a successful response; for 204 it receives `undefined` (use `z.undefined()`). */
  output: Schema<TOutput>;
  signal?: AbortSignal;
  /** Injectable transport (tests, demonstration); defaults to the client transport, then the global fetch. */
  fetch?: typeof fetch;
}

// RFC 9457 problem details, as produced by the API (docs/architecture/api.md §1).
interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
}

function parseProblem(value: unknown): ProblemDetails | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const optional = (key: string): string | undefined =>
    typeof raw[key] === 'string' ? raw[key] : undefined;
  const nonEmpty = (key: string): string | undefined => {
    const found = optional(key);
    return found === undefined || found === '' ? undefined : found;
  };
  const errors = Array.isArray(raw.errors)
    ? raw.errors.filter(
        (item): item is { path: string; message: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { path?: unknown }).path === 'string' &&
          typeof (item as { message?: unknown }).message === 'string',
      )
    : undefined;
  const status =
    typeof raw.status === 'number' && Number.isInteger(raw.status) ? raw.status : undefined;
  const type = optional('type');
  const title = optional('title');
  const detail = optional('detail');
  const code = nonEmpty('code');
  const requestId = nonEmpty('requestId');
  return {
    ...(type === undefined ? {} : { type }),
    ...(title === undefined ? {} : { title }),
    ...(status === undefined ? {} : { status }),
    ...(detail === undefined ? {} : { detail }),
    ...(code === undefined ? {} : { code }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(errors === undefined ? {} : { errors }),
  };
}

function isProblemDetails(value: ProblemDetails | null): value is ProblemDetails {
  return value !== null;
}

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
    const problem = json.ok ? parseProblem(json.value) : null;
    if (isProblemDetails(problem)) {
      const p = problem;
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
  /** Injectable transport (tests, demonstration); defaults to the client transport, then the global fetch. */
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

type ApiRoutes = typeof ROUTES;

export type Api = {
  [K in keyof ApiRoutes]: (
    input: RouteInput<ApiRoutes[K]>,
    options?: CallOptions,
  ) => Promise<RouteOutput<ApiRoutes[K]>>;
};

export type ApiFetch = <TInput, TOutput>(req: ApiRequest<TInput, TOutput>) => Promise<TOutput>;

export type CallApi = <R extends AnyRoute>(
  route: R,
  input: RouteInput<R>,
  options?: CallOptions,
) => Promise<RouteOutput<R>>;

export interface ApiClient {
  apiFetch: ApiFetch;
  callApi: CallApi;
  api: Api;
  loadRoutes: () => Promise<ApiRoutes>;
}

/**
 * SPEC-1002 EF-1 — options of a client of the API. `baseUrl` is the base of `/api/v1`-style
 * paths (`apiFetch`); registered routes carry their full path and are sent verbatim. `headers`
 * is re-evaluated before every attempt (cookie-free clients pass `Authorization: Bearer` here,
 * ADR-1005/ADR-1007). `onUnauthorized` is asked once after a 401: `true` replays the request
 * once with refreshed headers, `false` (or a second 401) raises the error as is (CL-3). The
 * web default uses none of it: cookies flow through `credentials: 'same-origin'`.
 */
export interface ApiClientOptions {
  /** Base of the API for `apiFetch` paths; the default client uses `/api/v1`. */
  baseUrl: string;
  /** Transport override; otherwise the client uses `globalThis.fetch` (CL-2). */
  fetch?: typeof fetch;
  /** Extra headers, merged over the standard ones, awaited on every attempt. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Single 401 replay gate (CL-3). */
  onUnauthorized?: () => Promise<boolean>;
}

/** Builds a client of `/api/v1` bound to the given options (EF-1, CA-4). */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const providedHeaders = async (): Promise<Record<string, string>> =>
    options.headers === undefined ? {} : await options.headers();

  function transport(override: typeof fetch | undefined): typeof fetch {
    const send = (override ?? options.fetch ?? globalThis.fetch) as typeof fetch | undefined;
    if (send === undefined) {
      // CL-2 — an explicit error instead of a bare TypeError from the runtime.
      throw new AppError(
        'NETWORK_ERROR',
        'fetch indisponible : aucun transport pour appeler l’API.',
      );
    }
    return send;
  }

  /**
   * Sends one request and decodes it. Never retries the network (a mutation must not be
   * replayed implicitly); replays once on 401 when the client allows it (CL-3). Every failure
   * is an `AppError`: validation, network, error response or unexpected body.
   */
  async function apiFetch<TInput, TOutput>(req: ApiRequest<TInput, TOutput>): Promise<TOutput> {
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
            errors: parsed.error.issues.map((i) => ({
              path: i.path.map(String).join('.'),
              message: i.message,
            })),
          });
        }
        value = parsed.data;
      }
      payload = JSON.stringify(value);
    }

    const send = transport(req.fetch);
    const baseHeaders: Record<string, string> = { Accept: 'application/json' };
    if (hasBody) baseHeaders['Content-Type'] = 'application/json';
    const init: RequestInit = { method: req.method, credentials: 'same-origin' };
    if (payload !== undefined) init.body = payload;
    if (req.signal !== undefined) init.signal = req.signal;
    init.headers = { ...baseHeaders, ...(await providedHeaders()) };

    const url = `${options.baseUrl}${req.path}`;
    let response: Response;
    try {
      response = await send(url, init);
    } catch (cause) {
      throw new AppError('NETWORK_ERROR', 'Le serveur est injoignable. Vérifiez votre connexion.', {
        cause,
      });
    }

    if (response.status === 401 && options.onUnauthorized !== undefined) {
      // CL-3 — one replay only, with the headers of the provider re-evaluated. A fresh
      // RequestInit: the first attempt keeps its own headers, never mutated in place.
      if (await options.onUnauthorized()) {
        const replay: RequestInit = {
          ...init,
          headers: { ...baseHeaders, ...(await providedHeaders()) },
        };
        try {
          response = await send(url, replay);
        } catch (cause) {
          throw new AppError(
            'NETWORK_ERROR',
            'Le serveur est injoignable. Vérifiez votre connexion.',
            {
              cause,
            },
          );
        }
      }
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

  /** Calls a route of the registry; returns the typed output or throws an `ApiError`. */
  async function callApi<R extends AnyRoute>(
    route: R,
    input: RouteInput<R>,
    callOptions: CallOptions = {},
  ): Promise<RouteOutput<R>> {
    const typed = input as {
      params?: Record<string, string | number>;
      query?: Record<string, unknown>;
      body?: unknown;
    };
    // Registered routes carry their full path (`/api/v1/…`): the base is already part of it.
    const url = buildUrl(route, typed);
    // The key is generated once: the 401 replay (CL-3) and the network retries (EF-9) reuse it,
    // so the server never runs the service twice.
    const idempotencyKey =
      route.idempotent === true || callOptions.idempotencyKey !== undefined
        ? (callOptions.idempotencyKey ?? crypto.randomUUID())
        : undefined;
    const buildHeaders = async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (typed.body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey !== undefined) {
        // An explicit key is also sent to a route that handles idempotency itself (SPEC-206).
        headers['Idempotency-Key'] = idempotencyKey;
      }
      return { ...headers, ...(await providedHeaders()) };
    };
    const init: RequestInit = { method: route.method, credentials: 'same-origin' };
    if (typed.body !== undefined) init.body = JSON.stringify(typed.body);
    if (callOptions.signal !== undefined) init.signal = callOptions.signal;
    init.headers = await buildHeaders();

    const send = transport(callOptions.fetch);
    const retries = route.idempotent === true ? (callOptions.networkRetries ?? 2) : 0;
    let response: Response | undefined;
    for (let attempt = 0; response === undefined; attempt += 1) {
      try {
        response = await send(url, init);
      } catch (cause) {
        // The same Idempotency-Key is sent again: the server never runs the service twice.
        if (attempt < retries && callOptions.signal?.aborted !== true) continue;
        throw new ApiError(
          'NETWORK_ERROR',
          'Le serveur est injoignable. Vérifiez votre connexion.',
          {
            status: 0,
            cause,
          },
        );
      }
    }

    if (response.status === 401 && options.onUnauthorized !== undefined) {
      // CL-3 — one replay only, same Idempotency-Key, provider headers re-evaluated. A
      // fresh RequestInit: the first attempt keeps its own headers, never mutated in place.
      if (await options.onUnauthorized()) {
        const replay: RequestInit = { ...init, headers: await buildHeaders() };
        try {
          response = await send(url, replay);
        } catch (cause) {
          throw new ApiError(
            'NETWORK_ERROR',
            'Le serveur est injoignable. Vérifiez votre connexion.',
            {
              status: 0,
              cause,
            },
          );
        }
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
    const parsed = (route.output as Schema<unknown>).safeParse(json.value);
    if (!parsed.success) throw invalid();
    return parsed.data as RouteOutput<R>;
  }

  // The route registry carries every Zod schema: it is loaded on the first API call only, so a
  // page that renders its initial data on the server never ships the contracts to the browser
  // (SPEC-804). The cache is per client.
  let routesPromise: Promise<ApiRoutes> | undefined;
  function loadRoutes(): Promise<ApiRoutes> {
    routesPromise ??= import('@learny/contracts/routes').then((module) => module.ROUTES);
    return routesPromise;
  }

  async function callNamed(
    name: string,
    input: never,
    callOptions?: CallOptions,
  ): Promise<unknown> {
    const routes = await loadRoutes();
    const route = (routes as Record<string, AnyRoute | undefined>)[name];
    if (route === undefined) throw new Error(`Route inconnue : ${name}`);
    return callApi(route, input, callOptions);
  }

  type ApiFunction = (input: never, options?: CallOptions) => Promise<unknown>;

  /**
   * `api.devEcho({ body })`, `api.devItems({ query })`… one function per registered route. Each
   * function is created on first access and kept on the target, so it is a real own property:
   * tests can replace it with `vi.spyOn(api, name)` like a plain object method.
   */
  const apiFunctions: Record<string, ApiFunction> = {};

  function ensureFunction(name: string): ApiFunction {
    apiFunctions[name] ??= (input, callOptions) => callNamed(name, input, callOptions);
    return apiFunctions[name];
  }

  const api = new Proxy(apiFunctions, {
    get(target, name) {
      if (typeof name !== 'string') return undefined;
      return target[name] ?? ensureFunction(name);
    },
    has(_target, name) {
      return typeof name === 'string';
    },
    getOwnPropertyDescriptor(target, name) {
      if (typeof name !== 'string') return undefined;
      ensureFunction(name);
      return Reflect.getOwnPropertyDescriptor(target, name);
    },
  }) as unknown as Api;

  return { apiFetch, callApi, api, loadRoutes };
}

// ---------------------------------------------------------------------------------------------
// Default client of the web application (EF-1): relative `/api/v1`, session cookie through
// `credentials: 'same-origin'`, no header provider, no 401 replay — exactly the behaviour of the
// former apps/web/lib/api-client.ts.

const defaultClient: ApiClient = createApiClient({ baseUrl: API_BASE });

/** Sends one request through the default client. */
export const apiFetch: ApiFetch = (req) => defaultClient.apiFetch(req);

/** Calls a route of the registry through the default client. */
export const callApi: CallApi = (route, input, callOptions) =>
  defaultClient.callApi(route, input, callOptions);

/** One function per registered route, bound to the default client. */
export const api: Api = defaultClient.api;

/** Loads (once) the route registry for the default client. */
export function loadRoutes(): Promise<ApiRoutes> {
  return defaultClient.loadRoutes();
}
