import { describe, expect, it } from 'vitest';

import { resolveApiRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('[SPEC-201] X-Request-Id', () => {
  it('reuses a conforming identifier', () => {
    expect(resolveApiRequestId('trace-1234abcd')).toBe('trace-1234abcd');
    expect(resolveApiRequestId('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it.each([
    ['absent', null],
    ['undefined', undefined],
    ['empty', ''],
    ['too short', 'abc-123'],
    ['too long', 'a'.repeat(65)],
    ['script tag', '<script>alert(1)</script>'],
    ['spaces', 'trace id 12345678'],
    ['underscore', 'trace_12345678'],
  ])('replaces a %s identifier by a UUID v4', (_name, value) => {
    expect(resolveApiRequestId(value)).toMatch(UUID);
  });
});
