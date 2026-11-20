import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import { parseAllowedOrigins } from '@learny/services';

import { methodsForPath } from './mount';

type Env = Readonly<Record<string, string | undefined>>;

const ALLOW_HEADERS = ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'];

const EXPOSE_HEADERS = [
  'X-Request-Id',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'Retry-After',
];

function allowedOrigins(env: Env): Set<string> {
  return new Set([
    ...parseAllowedOrigins(env.ALLOWED_ORIGINS),
    ...parseAllowedOrigins(env.NEXT_PUBLIC_APP_URL),
  ]);
}

export function createCorsMiddleware(env: Env): MiddlewareHandler {
  const allowed = allowedOrigins(env);
  const corsMiddleware = cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    credentials: true,
    allowHeaders: ALLOW_HEADERS,
    exposeHeaders: EXPOSE_HEADERS,
    allowMethods: (_origin, context) => methodsForPath(new URL(context.req.url).pathname),
  });

  const middleware: MiddlewareHandler = async (context, next) => {
    const origin = context.req.header('Origin');
    if (origin === undefined) {
      await next();
      return;
    }
    if (!allowed.has(origin)) {
      if (context.req.method === 'OPTIONS') {
        context.header('Vary', 'Origin', { append: true });
        return context.body(null, 204);
      }
      await next();
      return;
    }
    return corsMiddleware(context, next);
  };
  return middleware;
}
