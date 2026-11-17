// HTTP security headers of the web application (SPEC-805 EF-1, EF-2, ET-2; ADR-0042).
//
// `headers.ts` owns the static headers and their environment rules; `csp.ts` owns the per-request
// policy. Middleware (Next 16 `proxy.ts`) applies both to every matched HTML and API response
// without touching `Cache-Control`, `Content-Type` or `Set-Cookie`.
import { buildContentSecurityPolicy, createCspNonce, type CspEnvironment } from './csp';

export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';
export const REFERRER_POLICY_VALUE = 'strict-origin-when-cross-origin';
export const PERMISSIONS_POLICY_VALUE = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'hid=()',
  'midi=()',
  'screen-wake-lock=()',
  'xr-spatial-tracking=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
].join(', ');

type Env = Readonly<Record<string, string | undefined>>;

/** Production also covers managed deployments that set `APP_ENV` rather than `NODE_ENV`. */
export function isProductionEnvironment(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' || env.APP_ENV === 'production';
}

/** True when the request arrived over HTTPS, including behind a trusted reverse proxy. */
export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded !== null) return forwarded.split(',')[0]?.trim() === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface SecurityHeadersOptions {
  production: boolean;
  https: boolean;
  nonce: string;
  csp?: CspEnvironment;
}

/** Headers that never depend on the request; also applied by `next.config.ts` to `/:path*`. */
export function staticSecurityHeaders(production: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': REFERRER_POLICY_VALUE,
    'permissions-policy': PERMISSIONS_POLICY_VALUE,
    ...(production ? { 'strict-transport-security': HSTS_VALUE } : {}),
  };
}

/**
 * Full header set of one response. HSTS is only emitted in production and only when the request
 * was served over HTTPS: a local HTTP response never claims transport security it did not have.
 */
export function securityHeaders(options: SecurityHeadersOptions): Record<string, string> {
  const headers = staticSecurityHeaders(options.production);
  headers['content-security-policy'] = buildContentSecurityPolicy(options.nonce, {
    ...options.csp,
    production: options.production,
  });
  if (!options.https) delete headers['strict-transport-security'];
  return headers;
}

/** Applies the headers to an existing response without replacing its cache or content headers. */
export function applySecurityHeaders<T extends Response>(
  response: T,
  options: Omit<SecurityHeadersOptions, 'nonce'> & { nonce?: string },
): T {
  const nonce = options.nonce ?? createCspNonce();
  for (const [name, value] of Object.entries(securityHeaders({ ...options, nonce }))) {
    response.headers.set(name, value);
  }
  return response;
}
