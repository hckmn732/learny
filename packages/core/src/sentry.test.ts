import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { buildSafeSentryEvent, safeErrorType, sanitizeSentryEvent } from './sentry';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00.000Z') };
const SENTINEL = 'sentinel-secret-value';

describe('[SPEC-010] sentry projection', () => {
  it('projette un événement minimal avec des balises sûres', () => {
    const event = buildSafeSentryEvent(
      new TypeError('boom'),
      {
        requestId: 'req-123',
        route: '/api/v1/health',
        jobId: 'sdd-demo-job',
        userId: '8f8a3d4e-6f2b-4c1a-9e5d-2b7c8a9d0e1f',
      },
      FIXED,
    );
    expect(event).toEqual({
      level: 'error',
      platform: 'node',
      timestamp: '2026-11-11T12:20:00.000Z',
      message: 'unhandled error',
      tags: { requestId: 'req-123', route: '/api/v1/health', jobId: 'sdd-demo-job' },
      user: { id: '8f8a3d4e-6f2b-4c1a-9e5d-2b7c8a9d0e1f' },
      exception: { values: [{ type: 'TypeError' }] },
    });
    expect(JSON.stringify(event)).not.toContain('boom');
  });

  it('ignore les balises et identifiants non sûrs', () => {
    const event = buildSafeSentryEvent(
      new Error(SENTINEL),
      {
        requestId: 'bad id with spaces',
        route: 'x'.repeat(200),
        jobId: 'é',
        userId: 'not a uuid!',
      },
      FIXED,
    );
    expect(event.tags).toEqual({});
    expect(event.user).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain(SENTINEL);
  });

  it('réduit le type d’exception à un nom de classe sûr', () => {
    expect(safeErrorType(new RangeError('x'))).toBe('RangeError');
    expect(safeErrorType(new Error('x'))).toBe('Error');
    expect(safeErrorType('string')).toBe('Error');
    const weird = new Error('x');
    weird.name = 'not a class name!';
    expect(safeErrorType(weird)).toBe('Error');
  });

  it('reconstruit un événement SDK en supprimant message, pile, requête et données', () => {
    const event = sanitizeSentryEvent(
      {
        platform: 'javascript',
        message: SENTINEL,
        tags: { requestId: 'req-1', route: '/x', jobId: 'job-1', evil: SENTINEL },
        user: { id: 'user-123', email: 'alex@example.test' },
        exception: { values: [{ type: 'TypeError', value: SENTINEL, stacktrace: { frames: [] } }] },
        request: { headers: { authorization: `Bearer ${SENTINEL}` }, data: SENTINEL },
        extra: { secret: SENTINEL },
        breadcrumbs: [{ message: SENTINEL }],
      },
      FIXED,
    );
    expect(event.message).toBe('unhandled error');
    expect(event.platform).toBe('javascript');
    expect(event.tags).toEqual({ requestId: 'req-1', route: '/x', jobId: 'job-1' });
    expect(event.user).toEqual({ id: 'user-123' });
    expect(event.exception).toEqual({ values: [{ type: 'TypeError' }] });
    expect(JSON.stringify(event)).not.toContain(SENTINEL);
    expect(JSON.stringify(event)).not.toContain('alex@example.test');
  });

  it('reconstruit un événement sûr depuis une valeur non structurée', () => {
    const event = sanitizeSentryEvent('not an object', FIXED);
    expect(event).toEqual({
      level: 'error',
      platform: 'node',
      timestamp: '2026-11-11T12:20:00.000Z',
      message: 'unhandled error',
      tags: {},
      exception: { values: [{ type: 'Error' }] },
    });
    expect(sanitizeSentryEvent({ exception: { values: [] }, user: {} }, FIXED).exception).toEqual({
      values: [{ type: 'Error' }],
    });
    expect(
      sanitizeSentryEvent({ exception: { values: [null] }, user: { id: 42 } }, FIXED).user,
    ).toBeUndefined();
  });
});
