import type { ErrorReporter } from '@learny/core';

import { setOriginGuard, type OriginGuard } from './origin';
import { setRateLimiter, type RateLimiter } from './rate-limit';

const noopReporter: ErrorReporter = { enabled: false, capture: () => undefined };

let reporter: ErrorReporter = noopReporter;

export interface HttpConfiguration {
  reporter?: ErrorReporter;
  rateLimiter?: RateLimiter;
  originGuard?: OriginGuard;
  onBoot?: () => void;
}

/** Configures the host-specific transport integrations without importing the HTTP package effects. */
export function configureHttp(configuration: HttpConfiguration): void {
  if (configuration.reporter !== undefined) reporter = configuration.reporter;
  if (configuration.rateLimiter !== undefined) setRateLimiter(configuration.rateLimiter);
  if (configuration.originGuard !== undefined) setOriginGuard(configuration.originGuard);
  configuration.onBoot?.();
}

export function getHttpReporter(): ErrorReporter {
  return reporter;
}
