import { describe, expect, it } from 'vitest';

import { createFixedClock, FIXED_TIME_ISO } from './clock';
import { assertMockLlm, assertTestServerEnv } from './env';

describe('[SPEC-004] fixed clock', () => {
  it('defaults to 2026-11-11T12:20:00Z', () => {
    expect(FIXED_TIME_ISO).toBe('2026-11-11T12:20:00Z');
    expect(createFixedClock().now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
  });

  it('accepts an explicit ISO instant', () => {
    expect(createFixedClock('2027-01-02T03:04:05Z').now().toISOString()).toBe(
      '2027-01-02T03:04:05.000Z',
    );
    expect(createFixedClock('2026-11-11T13:20:00+01:00').now().toISOString()).toBe(
      '2026-11-11T12:20:00.000Z',
    );
  });

  it.each(['2026-13-45', '2026-11-11', 'demain', ''])(
    'rejects the invalid instant %j (CL-1)',
    (iso) => {
      expect(() => createFixedClock(iso)).toThrow(
        `Instant ISO invalide pour createFixedClock : ${iso}`,
      );
    },
  );

  it('returns independent Date objects', () => {
    const clock = createFixedClock();
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
    expect(clock.now()).not.toBe(clock.now());
  });

  it('runs unit tests with the mock AI and the fixed server clock (CA-1)', () => {
    expect(process.env.LLM_MODE).toBe('mock');
    expect(process.env.CLOCK_FIXED_AT).toBe(FIXED_TIME_ISO);
    expect(() => {
      assertMockLlm(process.env);
    }).not.toThrow();
  });

  it('refuses a live AI before any network call (CL-5)', () => {
    expect(() => {
      assertMockLlm({ LLM_MODE: 'live' });
    }).toThrow('LLM_MODE=live interdit en test');
  });

  it('checks the test server environment', () => {
    expect(() => {
      assertTestServerEnv({ CLOCK_FIXED_AT: FIXED_TIME_ISO, LLM_MODE: 'mock', TZ: 'UTC' });
    }).not.toThrow();
    expect(() => {
      assertTestServerEnv({ CLOCK_FIXED_AT: FIXED_TIME_ISO, LLM_MODE: 'mock', TZ: 'Europe/Paris' });
    }).toThrow('TZ doit valoir UTC');
  });
});
