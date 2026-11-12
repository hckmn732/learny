// Supabase Auth client bound to a request (SPEC-202 ET-3): cookies are read from the request and
// every cookie the client wants to write becomes a `Set-Cookie` header of the answer. No framework
// state is involved, so the same code serves route handlers and tests.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

import { AppError } from '@learny/core';
import type { AuthClient } from '@learny/services';

import { getPublicEnv } from '../server-env';

export const ONBOARDED_COOKIE = 'lr-onboarded';
export const NEXT_COOKIE = 'lr-next';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** httpOnly, lax, path `/`, `secure` everywhere except localhost (ET-3). */
export function sessionCookieOptions(request: Request, options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: !isLocalHost(new URL(request.url).hostname),
  };
}

export function readCookies(request: Request): { name: string; value: string }[] {
  return parseCookieHeader(request.headers.get('cookie') ?? '').map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
}

export function supabaseConfig(): { url: string; key: string } {
  const env = getPublicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le service d’authentification n’est pas configuré.');
  }
  return { url, key };
}

export function appUrl(request: Request): string {
  return getPublicEnv().NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

/** Auth client of a request; its cookie writes are appended to `responseHeaders`. */
export function createAuthClient(request: Request, responseHeaders: Headers): AuthClient {
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => readCookies(request),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) {
          // The PKCE verifier is useless here: links are verified with their token hash (ADR-0121).
          if (name.endsWith('-code-verifier')) continue;
          responseHeaders.append(
            'set-cookie',
            serializeCookieHeader(name, value, sessionCookieOptions(request, options)),
          );
        }
        for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
      },
    },
  });
  return client.auth;
}

/** Cookie of the learner's own cookies to delete on sign-out: every Supabase cookie plus ours. */
export function expiredCookieNames(request: Request): string[] {
  return readCookies(request)
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith('sb-') || name === ONBOARDED_COOKIE || name === NEXT_COOKIE);
}

/** Appends a `Set-Cookie` of one of our own cookies (httpOnly, lax, path `/`). */
export function appendCookie(
  request: Request,
  headers: Headers,
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  headers.append(
    'set-cookie',
    serializeCookieHeader(name, value, sessionCookieOptions(request, options)),
  );
}

export function expireCookie(request: Request, headers: Headers, name: string): void {
  appendCookie(request, headers, name, '', { maxAge: 0 });
}
