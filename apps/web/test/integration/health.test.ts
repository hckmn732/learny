import { describe, expect, it } from 'vitest';

import { GET } from '../../app/api/v1/health/route';

describe('[SPEC-001] GET /api/v1/health', () => {
  // SPEC-006 enriched the body (version, commit, database); `status` stays (backward compatible).
  // Before SPEC-101 the database is not configured: 200 with status "degraded".
  it('returns 200 with a status field and no-store', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'degraded' });
  });
});
