import { describe, expect, it } from 'vitest';

import { honoRoute } from './hono-route';

const health = honoRoute('/api/v1/health', 'GET');

describe('[SPEC-804] en-tête Server-Timing', () => {
  it('expose la durée du handler sans donnée personnelle', async () => {
    const response = await health(new Request('http://localhost/api/v1/health'));
    const timing = response.headers.get('server-timing');
    expect(timing).toMatch(/^app;dur=\d+(\.\d+)?$/);
    expect(timing).not.toContain('@');
    // Le test couvre l'en-tête, pas la disponibilité de la base (ok ou degraded selon l'environnement).
    const body = (await response.clone().json()) as { status?: unknown };
    expect(body.status).toMatch(/^(ok|degraded)$/);
  });
});
