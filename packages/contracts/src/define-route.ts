import type { z } from 'zod';

import type { ErrorCode } from '@learny/core';

// Route definitions shared by the handler, the typed client and the OpenAPI generator
// (SPEC-201 ET-1). A route is data: no logic, only schemas and policy.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RouteAuth = 'user' | 'public';
export type RateLimitProfile = 'default' | 'ai' | 'auth' | 'none';
/** 302 is for the redirecting routes of the authentication flow (`output: null`). */
export type SuccessStatus = 200 | 201 | 202 | 204 | 302;

type Schema = z.ZodType | undefined;

export interface RouteDef<
  P extends Schema = undefined,
  Q extends Schema = undefined,
  B extends Schema = undefined,
  O extends z.ZodType | null = z.ZodType | null,
> {
  /** Unique identifier: `dev.echo`, `auth.signIn`… */
  id: string;
  method: HttpMethod;
  /** Full path; parameters are written `:id`. */
  path: string;
  auth: RouteAuth;
  params?: P;
  query?: Q;
  body?: B;
  /** `null` for a 204 answer. */
  output: O;
  successStatus: SuccessStatus;
  /** POST that creates: requires `Idempotency-Key` (ADR-0120). Only for `auth: 'user'`. */
  idempotent?: boolean;
  /** Defaults to `'default'`. */
  rateLimit?: RateLimitProfile;
  /** French summary, used by OpenAPI. */
  summary: string;
  /** Business error codes the route may return (documentation). */
  errors: ErrorCode[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any route, whatever its schemas
export type AnyRoute = RouteDef<any, any, any, any>;

export function defineRoute<
  P extends Schema = undefined,
  Q extends Schema = undefined,
  B extends Schema = undefined,
  O extends z.ZodType | null = z.ZodType | null,
>(def: RouteDef<P, Q, B, O>): RouteDef<P, Q, B, O> {
  return def;
}

// A schema is "present" when the optional property of the route is not `undefined`.
type Present<S> = Exclude<S, undefined>;
type InferIn<S> = [Present<S>] extends [never]
  ? undefined
  : Present<S> extends z.ZodType
    ? z.input<Present<S>>
    : undefined;
type InferOut<S> = [Present<S>] extends [never]
  ? undefined
  : Present<S> extends z.ZodType
    ? z.output<Present<S>>
    : undefined;

/** Parsed (server-side) arguments of a route. */
export type RouteParams<R extends AnyRoute> = InferOut<R['params']>;
export type RouteQuery<R extends AnyRoute> = InferOut<R['query']>;
export type RouteBody<R extends AnyRoute> = InferOut<R['body']>;
export type RouteOutput<R extends AnyRoute> = R['output'] extends z.ZodType
  ? z.output<R['output']>
  : undefined;

/** Client-side input: what the caller writes (before defaults and coercions). */
export type RouteInput<R extends AnyRoute> = ([Present<R['params']>] extends [never]
  ? object
  : { params: InferIn<R['params']> }) &
  ([Present<R['query']>] extends [never] ? object : { query?: InferIn<R['query']> }) &
  ([Present<R['body']>] extends [never] ? object : { body: InferIn<R['body']> });
