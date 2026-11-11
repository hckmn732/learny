import { describe, expect, it } from 'vitest';

import { GET } from '../../app/api/v1/health/route';

describe('[SPEC-001] GET /api/v1/health', () => {
  it('returns 200 with { status: "ok" } and no-store', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
