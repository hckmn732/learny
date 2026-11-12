// Origin check of the mutations of /api/v1 (SPEC-208 EF-5, EF-6, ET-5; ADR-0213). It protects
// against cross-site request forgery: a mutation must come from the application or from an origin
// listed in `ALLOWED_ORIGINS`. Origins are compared exactly (no wildcard, no suffix match).
import { AppError } from '@learny/core';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginRequest {
  method: string;
  pathname: string;
  /** `Origin` header. */
  origin: string | null;
  /** `Sec-Fetch-Site` header. */
  secFetchSite: string | null;
  /** Origin the request was received on (used when the application URL is not configured). */
  requestOrigin: string;
}

export interface OriginGuardOptions {
  /** `NEXT_PUBLIC_APP_URL`; absent in local development. */
  appUrl?: string | undefined;
  /** `ALLOWED_ORIGINS`: comma separated origins, possibly empty. */
  allowedOrigins?: string | undefined;
}

function normalize(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    return parsed.origin === 'null' ? null : parsed.origin;
  } catch {
    return null;
  }
}

/** Paths that carry their own proof of origin (signature, token) and are exempt. */
export function isOriginExempt(method: string, pathname: string): boolean {
  if (pathname.startsWith('/api/v1/webhooks/')) return true;
  if (pathname === '/api/inngest' || pathname.startsWith('/api/inngest/')) return true;
  return method === 'POST' && pathname === '/api/v1/email/unsubscribe';
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];
  return value.split(',').map((entry) => {
    const origin = normalize(entry);
    if (origin === null) throw new Error(`ALLOWED_ORIGINS : origine invalide « ${entry.trim()} »`);
    return origin;
  });
}

export interface OriginGuard {
  check(request: OriginRequest): void;
}

export function createOriginGuard(options: OriginGuardOptions): OriginGuard {
  const configured = options.appUrl === undefined ? null : normalize(options.appUrl);
  const allowed = parseAllowedOrigins(options.allowedOrigins);
  return {
    check(request) {
      const method = request.method.toUpperCase();
      if (SAFE_METHODS.has(method) || isOriginExempt(method, request.pathname)) return;
      const accepted = new Set([configured ?? normalize(request.requestOrigin), ...allowed]);
      const origin = request.origin === null ? null : normalize(request.origin);
      const ok =
        request.origin === null
          ? request.secFetchSite === 'same-origin'
          : origin !== null && accepted.has(origin);
      if (!ok) {
        throw new AppError('ORIGIN_REJECTED', 'Requête refusée : origine non autorisée.');
      }
    },
  };
}
