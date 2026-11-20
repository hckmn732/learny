import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiReporter, initApiSentry, sentryEnabled } from '../../src/sentry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[SPEC-1103] absorbed worker telemetry', () => {
  it('keeps Sentry disabled in tests and without a DSN', async () => {
    expect(sentryEnabled({ APP_ENV: 'production', SENTRY_DSN: 'https://sentry.test/1' })).toBe(
      true,
    );
    expect(sentryEnabled({ APP_ENV: 'test', SENTRY_DSN: 'https://sentry.test/1' })).toBe(false);
    expect(await initApiSentry({ APP_ENV: 'test', SENTRY_DSN: 'https://sentry.test/1' })).toBe(
      false,
    );
  });

  it('sanitizes job errors through the reporter transport', () => {
    const transport = vi.fn();
    const reporter = createApiReporter(
      {
        APP_ENV: 'production',
        SENTRY_DSN: 'https://sentry.test/1',
      },
      transport,
    );

    const event = reporter.capture(new Error('secret detail'), {
      route: 'job:demo',
      jobId: 'run-1',
    });

    expect(reporter.enabled).toBe(true);
    expect(event).toMatchObject({ message: 'unhandled error', tags: { route: 'job:demo' } });
    expect(JSON.stringify(event)).not.toContain('secret detail');
    expect(transport).toHaveBeenCalledWith(event);
  });
});
