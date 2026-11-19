import { configureHttp, createRateLimiter, createRequestOriginGuard } from '@learny/http';

import { registerInlineJobs } from './quiz-grade-registry';
import { getServerReporter } from './sentry';

/**
 * SPEC-1004 — the HTTP layer of this process is configured when the implementation tables are
 * imported, exactly like `apps/web/lib/api/handler.ts` did for every route module: error reporter
 * (Sentry when configured), token-bucket limiter, origin guard and the inline job registry.
 */
export function configureApiRoutes(): void {
  configureHttp({
    reporter: getServerReporter(),
    rateLimiter: createRateLimiter(),
    originGuard: createRequestOriginGuard(),
    onBoot: registerInlineJobs,
  });
}
