import { describe, expect, it } from 'vitest';

import type { Clock } from './clock';
import { AppError } from './errors';
import {
  createLogCapture,
  createLogger,
  levelFromEnv,
  sanitizeLogFields,
  serializeError,
  type SafeLogFields,
} from './logger';
import { REDACTED, redactText } from './redaction';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00.000Z') };

// Values that must never appear in the serialised bytes (CA-2, CL-2).
const EMAIL = 'sentinel-alex@example.test';
const API_KEY = 'sk-sentinel-0123456789abcdef'; // learny-test-only
const COOKIE = 'session=sentinel-cookie-value';
const APPORT = 'apport-sentinel-content-never-logged';
const PROMPT = 'prompt-sentinel-never-logged';

describe('[SPEC-010] logger', () => {
  it('writes one JSON line with timestamp, level, message and correlation fields (EF-2)', () => {
    const capture = createLogCapture();
    const logger = createLogger({
      requestId: 'req-1',
      userId: 'user-1',
      route: '/api/v1/demo',
      clock: FIXED,
      destination: capture.destination,
      level: 'info',
    });

    logger.info('request completed', { method: 'GET', status: 200, durationMs: 5 });

    expect(capture.records()).toEqual([
      {
        level: 'info',
        timestamp: '2026-11-11T12:20:00.000Z',
        message: 'request completed',
        requestId: 'req-1',
        userId: 'user-1',
        route: '/api/v1/demo',
        method: 'GET',
        status: 200,
        durationMs: 5,
      },
    ]);
    expect(capture.text().trim().split('\n')).toHaveLength(1);
  });

  it('drops every nested and non-allow-listed field containing a sentinel (ET-1, CL-2)', () => {
    const capture = createLogCapture();
    const logger = createLogger({
      requestId: 'req-2',
      clock: FIXED,
      destination: capture.destination,
    });

    logger.error(`échec pour ${EMAIL}`, {
      requestId: 'req-2',
      email: EMAIL,
      apiKey: API_KEY,
      cookie: COOKIE,
      prompt: PROMPT,
      apport: APPORT,
      nested: { password: API_KEY, body: APPORT },
      method: 'POST',
      status: 500,
    } as unknown as SafeLogFields);

    const text = capture.text();
    for (const sentinel of [EMAIL, API_KEY, COOKIE, APPORT, PROMPT]) {
      expect(text, sentinel).not.toContain(sentinel);
    }
    const [record] = capture.records();
    expect(record).toMatchObject({
      requestId: 'req-2',
      message: `échec pour ${REDACTED}`,
      method: 'POST',
      status: 500,
    });
    expect(record).not.toHaveProperty('email');
    expect(record).not.toHaveProperty('apiKey');
    expect(record).not.toHaveProperty('nested');
    expect(record).not.toHaveProperty('apport');
  });

  it('serialises an exception as a type and a code only, never its message or stack (EF-3)', () => {
    const capture = createLogCapture();
    const logger = createLogger({
      requestId: 'req-3',
      clock: FIXED,
      destination: capture.destination,
    });
    const error = new AppError('INTERNAL_ERROR', `boom ${EMAIL}`, { cause: new Error(PROMPT) });

    logger.error('request failed', { code: 'INTERNAL_ERROR', status: 500 }, error);

    const text = capture.text();
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(PROMPT);
    expect(text).not.toContain('stack');
    expect(capture.records()[0]).toMatchObject({
      err: { error: 'AppError', code: 'INTERNAL_ERROR' },
    });
    expect(serializeError(new Error(EMAIL))).toEqual({ error: 'Error' });
    expect(serializeError('pas une erreur')).toEqual({});
  });

  it('redacts e-mail addresses, provider keys and key=value secrets in strings (EF-2)', () => {
    expect(redactText(`contact ${EMAIL}`)).toBe(`contact ${REDACTED}`);
    expect(redactText(`clé ${API_KEY}`)).toBe(`clé ${REDACTED}`);
    expect(redactText('authorization: Bearer abc.def.ghi')).toContain(REDACTED);
    expect(redactText('password=hunter2')).toBe(`password=${REDACTED}`);
    expect(redactText('token: abc123')).toBe(`token: ${REDACTED}`);
    expect(sanitizeLogFields({ userId: EMAIL, route: '/api/v1/x' })).toEqual({
      userId: REDACTED,
      route: '/api/v1/x',
    });
  });

  it('honours LOG_LEVEL: below-level entries produce no byte (EF-2)', () => {
    expect(levelFromEnv({ LOG_LEVEL: 'debug' })).toBe('debug');
    expect(levelFromEnv({ LOG_LEVEL: 'chatty' })).toBe('info');
    expect(levelFromEnv({})).toBe('info');

    const capture = createLogCapture();
    const logger = createLogger({
      level: 'warn',
      clock: FIXED,
      destination: capture.destination,
    });
    logger.info('hidden');
    logger.debug('hidden');
    logger.warn('shown', { code: 'DEGRADED' });
    expect(capture.records().map((record) => record.message)).toEqual(['shown']);
  });

  it('creates a child logger sharing the destination and adding context', () => {
    const capture = createLogCapture();
    const root = createLogger({
      requestId: 'req-4',
      clock: FIXED,
      destination: capture.destination,
    });
    root.child({ userId: 'user-4', jobId: 'job-4' }).info('child line');

    expect(capture.records()[0]).toMatchObject({
      requestId: 'req-4',
      userId: 'user-4',
      jobId: 'job-4',
    });
  });
});
