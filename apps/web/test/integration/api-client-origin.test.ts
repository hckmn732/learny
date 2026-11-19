// SPEC-1002 §12 — le client par défaut du web traverse la réexportation de @learny/api-client
// et reçoit exactement le corps que renvoie la route health du serveur de test (CA-5, EF-2).
import { testApiHandler } from 'next-test-api-route-handler';
import { describe, expect, it } from 'vitest';

import { ROUTES } from '@learny/contracts';

import { GET } from '../../app/api/v1/health/route';
import { callApi } from '../../lib/api-client';

describe('[SPEC-1002] web api client', () => {
  it('le client par défaut du web reçoit le même corps que la route health (CA-5)', async () => {
    await testApiHandler({
      appHandler: { GET },
      url: 'http://localhost/api/v1/health',
      test: async ({ fetch }) => {
        // Appel direct de la route : le corps de référence, celui d'avant le paquet partagé.
        const direct = await fetch({ method: 'GET' });
        const directBody = JSON.parse(await direct.text()) as Record<string, unknown>;

        // Le client typé du web (réexportation) à travers la route enregistrée du registre :
        // le transport injectable achemine l'appel vers le gestionnaire de la route.
        const transport = (async (_input: RequestInfo | URL, init?: RequestInit) => {
          const headers = Object.fromEntries(new Headers(init?.headers).entries());
          const response = await fetch({
            method: init?.method ?? 'GET',
            headers,
            ...(init?.body === undefined ? {} : { body: init.body as string }),
          });
          return response as unknown as Response;
        }) as unknown as typeof fetch;

        const viaClient = await callApi(ROUTES.health, {}, { fetch: transport });
        expect(direct.status).toBe(200);
        expect(viaClient).toEqual(directBody);
      },
    });
  });
});
