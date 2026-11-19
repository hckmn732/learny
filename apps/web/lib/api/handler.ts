import { configureHttp, createRateLimiter, createRequestOriginGuard } from '@learny/http';

import { registerInlineJobs } from '../quiz-grade-registry';
import { getServerReporter } from '../sentry';

configureHttp({
  reporter: getServerReporter(),
  rateLimiter: createRateLimiter(),
  originGuard: createRequestOriginGuard(),
  onBoot: registerInlineJobs,
});

export * from '@learny/http/handler';
