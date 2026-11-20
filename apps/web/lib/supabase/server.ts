import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

import { parsePublicEnv } from '@learny/config';
import { AppError } from '@learny/core';

import { ONBOARDING_TICKET_COOKIE } from '../onboarding-ticket';

export const ONBOARDED_COOKIE = ONBOARDING_TICKET_COOKIE;
export const NEXT_COOKIE = 'lr-next';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

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
  const env = parsePublicEnv(process.env);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le service d’authentification n’est pas configuré.');
  }
  return { url, key };
}

export function appUrl(request: Request): string {
  return parsePublicEnv(process.env).NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export function createAuthClient(request: Request, responseHeaders: Headers) {
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => readCookies(request),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) {
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

export function expiredCookieNames(request: Request): string[] {
  return readCookies(request)
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith('sb-') || name === ONBOARDED_COOKIE || name === NEXT_COOKIE);
}

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
