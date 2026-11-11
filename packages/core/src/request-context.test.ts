import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { createLogCapture, createLogger } from './logger';
import {
  REQUEST_ID_PATTERN,
  currentRequestContext,
  requestContext,
  resolveRequestId,
  runWithRequestContext,
} from './request-context';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00.000Z') };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('[SPEC-010] request context', () => {
  it('reuses a bounded incoming identifier and generates a UUID otherwise (ET-3, CL-1)', () => {
    expect(resolveRequestId('req-abc_123:4')).toBe('req-abc_123:4');
    expect(resolveRequestId(null)).toMatch(UUID);
    expect(resolveRequestId('')).toMatch(UUID);
    expect(resolveRequestId('bad id with spaces')).toMatch(UUID);
    expect(resolveRequestId('bad\ncontrol')).toMatch(UUID);
    expect(resolveRequestId('x'.repeat(65))).toMatch(UUID);
    expect(resolveRequestId('../etc/passwd')).toMatch(UUID);
    expect(REQUEST_ID_PATTERN.test(resolveRequestId('anything'))).toBe(true);
  });

  it('propagates requestId and userId to the logger created in the context (EF-1, ET-2)', () => {
    const capture = createLogCapture();
    runWithRequestContext(requestContext('req-ctx', 'user-ctx'), () => {
      createLogger({ route: '/api/v1/x', clock: FIXED, destination: capture.destination }).info(
        'inside',
      );
    });

    expect(capture.records()[0]).toMatchObject({
      requestId: 'req-ctx',
      userId: 'user-ctx',
      route: '/api/v1/x',
    });
    expect(currentRequestContext()).toBeUndefined();
  });

  it('keeps two concurrent requests isolated, identifiers and users never mix (CL-6, CA-1)', async () => {
    const capture = createLogCapture();
    const first = runWithRequestContext(requestContext('req-a', 'user-a'), async () => {
      await wait(15);
      createLogger({ clock: FIXED, destination: capture.destination }).info('first');
      await wait(5);
      createLogger({ clock: FIXED, destination: capture.destination }).info('first-again');
    });
    const second = runWithRequestContext(requestContext('req-b', 'user-b'), async () => {
      await wait(5);
      createLogger({ clock: FIXED, destination: capture.destination }).info('second');
    });
    await Promise.all([first, second]);

    const byMessage = new Map(capture.records().map((record) => [record.message, record] as const));
    expect(byMessage.get('first')).toMatchObject({ requestId: 'req-a', userId: 'user-a' });
    expect(byMessage.get('first-again')).toMatchObject({
      requestId: 'req-a',
      userId: 'user-a',
    });
    expect(byMessage.get('second')).toMatchObject({ requestId: 'req-b', userId: 'user-b' });
  });

  it('omits userId when the request is anonymous', () => {
    const capture = createLogCapture();
    runWithRequestContext({ requestId: 'req-anon' }, () => {
      createLogger({ clock: FIXED, destination: capture.destination }).info('anonymous');
    });
    expect(capture.records()[0]).not.toHaveProperty('userId');
  });
});
