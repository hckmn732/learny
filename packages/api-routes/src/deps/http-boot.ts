import { configureHttp, createRateLimiter, createRequestOriginGuard } from '@learny/http';

import { registerInlineJobs } from './quiz-grade-registry';
import { getServerReporter } from './sentry';

/**
 * SPEC-1004 — the HTTP layer of apps/api is configured when the implementation tables are
 * imported: error reporter (Sentry when configured), token-bucket limiter, origin guard and inline
 * job registry.
 */
export function configureApiRoutes(): void {
  configureHttp({
    reporter: getServerReporter(),
    rateLimiter: createRateLimiter(),
    originGuard: createRequestOriginGuard(),
    onBoot: registerInlineJobs,
  });
}
