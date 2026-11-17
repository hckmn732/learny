// SPEC-805 CA-4, CL-5 — anti-SSRF transport of the web ingestion.
//
// The real extraction pipeline runs with an injected transport: no socket is opened. Initial URLs
// and every redirect hop are validated after DNS resolution, the connection is pinned on the
// verified address, and the same size/time bounds as production apply.
import { describe, expect, it } from 'vitest';

import type { SafeFetchRequest, SafeFetchResponse } from '@learny/core/net';

import { extractWeb } from '../../src/extract/web';

const PUBLIC = [{ address: '93.184.216.34', family: 4 }] as const;

function body(text: string): AsyncIterable<Uint8Array> {
  return (async function* generate() {
    await Promise.resolve();
    yield new TextEncoder().encode(text);
  })();
}

function response(
  status: number,
  headers: Record<string, string> = {},
  text = '',
): SafeFetchResponse {
  return { status, headers, body: body(text) };
}

describe('[SPEC-805] import — anti-SSRF', () => {
  it.each([
    ['file', 'file:///etc/passwd', 'URL_INVALID'],
    ['gopher', 'gopher://example.test/', 'URL_INVALID'],
    ['credentials', 'https://user:secret@example.test/', 'URL_INVALID'],
    ['loopback v4', 'http://127.0.0.1/secret', 'URL_BLOCKED_HOST'],
    ['loopback v6', 'http://[::1]/secret', 'URL_BLOCKED_HOST'],
    ['link-local', 'http://169.254.169.254/latest/meta-data', 'URL_BLOCKED_HOST'],
    ['private v4', 'http://10.0.0.1/secret', 'URL_BLOCKED_HOST'],
    ['private v6', 'http://[fd00::1]/secret', 'URL_BLOCKED_HOST'],
  ])('CL-5 — refuse %s avant toute connexion', async (_label, url, code) => {
    let calls = 0;
    await expect(
      extractWeb(url, {
        respectRobots: false,
        transport: () => {
          calls += 1;
          return Promise.resolve(response(200, { 'content-type': 'text/html' }, '<p>x</p>'));
        },
      }),
    ).rejects.toMatchObject({ code });
    expect(calls).toBe(0);
  });

  it.each([
    ['127.0.0.1', 'http://127.0.0.1/admin'],
    ['link-local', 'http://169.254.169.254/latest/meta-data'],
    ['private v4', 'https://10.0.0.1/'],
    ['private v6', 'https://[fd00::1]/'],
  ])('CL-5 — refuse une redirection vers %s avant la seconde requête', async (_label, location) => {
    const requests: string[] = [];
    await expect(
      extractWeb('https://example.test/go', {
        lookup: () => Promise.resolve(PUBLIC),
        respectRobots: false,
        transport: (request: SafeFetchRequest) => {
          requests.push(request.url.href);
          return Promise.resolve(response(302, { location }));
        },
      }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED_HOST' });
    expect(requests).toEqual(['https://example.test/go']);
  });

  it('CL-5 — un DNS rebindé vers une adresse privée est refusé avant la connexion', async () => {
    let lookups = 0;
    const requests: string[] = [];
    await expect(
      extractWeb('https://rebind.test/start', {
        lookup: () => {
          lookups += 1;
          return Promise.resolve(
            lookups === 1
              ? [{ address: '93.184.216.34', family: 4 }]
              : [{ address: '10.0.0.7', family: 4 }],
          );
        },
        respectRobots: false,
        transport: (request) => {
          requests.push(request.url.href);
          return Promise.resolve(response(302, { location: 'https://rebind.test/next' }));
        },
      }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED_HOST' });
    expect(requests).toEqual(['https://rebind.test/start']);
    expect(lookups).toBe(2);
  });

  it('CL-5 — une réponse au-delà de la limite de taille reste une erreur lisible', async () => {
    await expect(
      extractWeb('https://example.test/big', {
        lookup: () => Promise.resolve(PUBLIC),
        respectRobots: false,
        maxBytes: 5,
        transport: () =>
          Promise.resolve(response(200, { 'content-type': 'text/html' }, '<p>trop grand</p>')),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TOO_LARGE', permanent: true });
  });

  it('CL-5 — un dépassement de délai est refusé et ne lit aucun corps', async () => {
    let calls = 0;
    await expect(
      extractWeb('https://example.test/slow', {
        lookup: () => Promise.resolve(PUBLIC),
        respectRobots: false,
        timeoutMs: 10,
        transport: (request) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => {
              reject(new DOMException('timeout', 'TimeoutError'));
            });
          });
        },
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TIMEOUT' });
    expect(calls).toBe(1);
  });
});
