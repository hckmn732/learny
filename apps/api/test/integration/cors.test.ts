import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';

const env = {
  ALLOWED_ORIGINS: 'https://native-web.example, https://secondary.example',
  NEXT_PUBLIC_APP_URL: 'https://learny.example',
};

describe('[SPEC-1301] cors', () => {
  it.each(['https://native-web.example', 'https://learny.example'])(
    'ajoute les en-têtes CORS attendus pour %s (CA-3)',
    async (origin) => {
      const response = await createApp({ env }).request('/api/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET');
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'Authorization,Content-Type,Idempotency-Key,X-Request-Id',
      );
      expect(response.headers.get('access-control-expose-headers')).toBe(
        'X-Request-Id,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Retry-After',
      );
    },
  );

  it('ne laisse aucun en-tête CORS sur une origine interdite et ne monte pas la route (CL-1)', async () => {
    const response = await createApp({ env }).request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(
      [...response.headers.keys()].filter((name) => name.startsWith('access-control')),
    ).toEqual([]);
  });

  it('n’ajoute pas les en-têtes CORS aux requêtes sans Origin', async () => {
    const response = await createApp({ env }).request('/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('access-control-expose-headers')).toBeNull();
  });
});
