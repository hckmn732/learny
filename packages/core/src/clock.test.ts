import { afterEach, describe, expect, it } from 'vitest';

import { clock, createClockFromEnv, setClock, systemClock } from './clock';

describe('[SPEC-001] clock', () => {
  const initial = clock;
  afterEach(() => {
    setClock(initial);
  });

  it('freezes time on CLOCK_FIXED_AT', () => {
    const c = createClockFromEnv({ CLOCK_FIXED_AT: '2026-11-11T12:20:00Z' });
    expect(c.now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
  });

  it('returns the same value on successive calls', () => {
    const c = createClockFromEnv({ CLOCK_FIXED_AT: '2026-11-11T12:20:00Z' });
    expect(c.now().getTime()).toBe(c.now().getTime());
  });

  it('uses the system clock without CLOCK_FIXED_AT', () => {
    expect(createClockFromEnv({})).toBe(systemClock);
  });

  it('throws on an invalid CLOCK_FIXED_AT', () => {
    expect(() => createClockFromEnv({ CLOCK_FIXED_AT: '2026-13-45' })).toThrow(
      new Error('CLOCK_FIXED_AT invalide : 2026-13-45'),
    );
  });

  it('is initialised from the test environment', () => {
    expect(clock.now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
  });

  it('lets setClock replace the clock', () => {
    const at = createClockFromEnv({ CLOCK_FIXED_AT: '2030-01-01T00:00:00Z' });
    setClock(at);
    expect(clock.now().toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });
});
