// Anti-SSRF retrieval, redirects, robots.txt and bounds (SPEC-510 ET-1, EF-5, CA-3).
import { describe, expect, it } from 'vitest';

import {
  clearRobotsCache,
  isAllowedByRobots,
  safeFetch,
  type SafeFetchRequest,
  type SafeFetchResponse,
} from './safe-fetch';

const PUBLIC = { address: '93.184.216.34', family: 4 } as const;

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

const publicLookup = () => Promise.resolve([PUBLIC]);

describe('[SPEC-510] récupération réseau sûre', () => {
  it('valide l’adresse puis épingle la connexion sur l’IP vérifiée (ET-1)', async () => {
    const requests: SafeFetchRequest[] = [];
    const result = await safeFetch('https://example.test/article', {
      lookup: publicLookup,
      respectRobots: false,
      transport: (request) => {
        requests.push(request);
        return Promise.resolve(response(200, { 'content-type': 'text/html' }, '<p>ok</p>'));
      },
    });

    expect(result.url).toBe('https://example.test/article');
    expect(result.contentType).toBe('text/html');
    expect(new TextDecoder().decode(result.body)).toBe('<p>ok</p>');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.address).toEqual(PUBLIC);
  });

  it('refuse une IP privée directe sans ouvrir de connexion (CL-1)', async () => {
    let calls = 0;
    await expect(
      safeFetch('https://127.0.0.1/secret', {
        transport: () => {
          calls += 1;
          return Promise.resolve(response(200, {}, 'secret'));
        },
      }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED_HOST' });
    expect(calls).toBe(0);
  });

  it('refuse une redirection vers une adresse privée avant la seconde requête (CL-1)', async () => {
    const requests: string[] = [];
    await expect(
      safeFetch('https://example.test/go', {
        lookup: publicLookup,
        respectRobots: false,
        transport: (request) => {
          requests.push(request.url.href);
          return Promise.resolve(response(302, { location: 'https://127.0.0.1/admin' }));
        },
      }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED_HOST' });
    expect(requests).toEqual(['https://example.test/go']);
  });

  it('refuse le protocole non HTTP(S) et les identifiants (EF-5)', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toMatchObject({ code: 'URL_INVALID' });
    await expect(safeFetch('https://user:secret@example.test/')).rejects.toMatchObject({
      code: 'URL_INVALID',
    });
  });

  it('respecte un Disallow applicable à LearnyBot (CL-2)', async () => {
    clearRobotsCache();
    const requests: string[] = [];
    const transport = (request: SafeFetchRequest): Promise<SafeFetchResponse> => {
      requests.push(request.url.pathname);
      if (request.url.pathname === '/robots.txt') {
        return Promise.resolve(
          response(200, { 'content-type': 'text/plain' }, 'User-agent: *\nDisallow: /private'),
        );
      }
      return Promise.resolve(response(200, {}, '<p>contenu</p>'));
    };

    await expect(
      safeFetch('https://robots.test/private/page', { lookup: publicLookup, transport }),
    ).rejects.toMatchObject({ code: 'WEB_ROBOTS_DISALLOWED' });
    expect(requests).toEqual(['/robots.txt']);
  });

  it('accepte une règle Allow plus longue que le Disallow (robots.txt)', () => {
    const text = ['User-agent: *', 'Disallow: /docs', 'Allow: /docs/public'].join('\n');
    expect(isAllowedByRobots('LearnyBot/1.0', '/docs/public/page', text)).toBe(true);
    expect(isAllowedByRobots('LearnyBot/1.0', '/docs/private', text)).toBe(false);
    expect(isAllowedByRobots('LearnyBot/1.0', '/blog', text)).toBe(true);
  });

  it('borne les redirections (FETCH_TOO_MANY_REDIRECTS)', async () => {
    let calls = 0;
    await expect(
      safeFetch('https://example.test/loop', {
        lookup: publicLookup,
        respectRobots: false,
        maxRedirects: 2,
        transport: () => {
          calls += 1;
          return Promise.resolve(response(302, { location: '/loop' }));
        },
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TOO_MANY_REDIRECTS' });
    expect(calls).toBe(3);
  });

  it('borne le délai total (FETCH_TIMEOUT, CL-3)', async () => {
    await expect(
      safeFetch('https://example.test/slow', {
        lookup: publicLookup,
        respectRobots: false,
        timeoutMs: 10,
        transport: (request) =>
          new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => {
              reject(new DOMException('timeout', 'TimeoutError'));
            });
          }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TIMEOUT' });
  });

  it('borne la taille lue en flux et ne renvoie aucun contenu partiel (CL-3)', async () => {
    const chunks = (async function* generate() {
      await Promise.resolve();
      yield new Uint8Array(10).fill(1);
      yield new Uint8Array(10).fill(2);
    })();
    await expect(
      safeFetch('https://example.test/big', {
        lookup: publicLookup,
        respectRobots: false,
        maxBytes: 15,
        transport: () => Promise.resolve({ status: 200, headers: {}, body: chunks }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TOO_LARGE' });
  });
});
