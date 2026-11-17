import { describe, expect, it } from 'vitest';

import { GET as health } from '../../app/api/v1/health/route';

describe('[SPEC-804] en-tête Server-Timing', () => {
  it('expose la durée du handler sans donnée personnelle', async () => {
    const response = await health(new Request('http://localhost/api/v1/health'));
    const timing = response.headers.get('server-timing');
    expect(timing).toMatch(/^app;dur=\d+(\.\d+)?$/);
    expect(timing).not.toContain('@');
    expect(JSON.parse(await response.clone().text())).toMatchObject({ status: 'ok' });
  });
});
