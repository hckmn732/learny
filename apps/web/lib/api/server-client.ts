import 'server-only';

import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';

import { createApiClient, type ApiClient } from '@learny/api-client';
import { ApiError } from '@learny/api-client';
import { apiProxySecretFromEnv } from '@learny/config/derived-secrets';

const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:3001';

type HeaderSource = Pick<Headers, 'get'>;

function internalOrigin(): string {
  return (process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL).replace(/\/+$/u, '');
}

function forwardedHeaders(source: HeaderSource): Record<string, string> {
  const result: Record<string, string> = {};
  const cookie = source.get('cookie');
  const requestId = source.get('x-request-id') ?? randomUUID();
  const host = source.get('x-forwarded-host') ?? source.get('host') ?? 'localhost';
  const proto = source.get('x-forwarded-proto') ?? 'http';
  const address = source.get('x-forwarded-for') ?? source.get('x-real-ip');
  // ADR-4007: the relay secret is a subkey of APP_ENCRYPTION_KEY, never a variable of its own.
  const secret = apiProxySecretFromEnv(process.env);
  const origin = source.get('origin');
  const secFetchSite = source.get('sec-fetch-site');

  if (cookie !== null) result.Cookie = cookie;
  result['X-Request-Id'] = requestId;
  result['X-Forwarded-Host'] = host;
  result['X-Forwarded-Proto'] = proto;
  if (address !== null) result['X-Forwarded-For'] = address;
  if (secret !== undefined) result['X-Learny-Proxy-Secret'] = secret;
  // SPEC-208: a mutation served by a server component still carries its origin proof. The browser
  // headers win when they exist; on a render without them the page asserts its own origin, which
  // is exactly what a same-origin fetch from the browser would send. Without it the origin guard
  // answers ORIGIN_REJECTED and a server-rendered page such as the simulated Checkout fails.
  result.Origin = origin ?? `${proto}://${host}`;
  if (secFetchSite !== null) result['Sec-Fetch-Site'] = secFetchSite;
  return result;
}

function internalFetch(origin: string): typeof fetch {
  return (input, init) => {
    const request = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const target = /^https?:\/\//u.test(request) ? request : new URL(request, origin);
    return fetch(target, init);
  };
}

export async function serverApi(source?: HeaderSource): Promise<ApiClient> {
  const requestHeaders = source ?? (await headers());
  const origin = internalOrigin();
  return createApiClient({
    baseUrl: `${origin}/api/v1`,
    fetch: internalFetch(origin),
    headers: () => forwardedHeaders(requestHeaders),
  });
}

export function apiErrorRequestId(error: unknown): string | undefined {
  return error instanceof ApiError ? error.requestId : undefined;
}

export function isApiError(error: unknown, code: string, status?: number): error is ApiError {
  return (
    error instanceof ApiError &&
    error.code === code &&
    (status === undefined || error.status === status)
  );
}
