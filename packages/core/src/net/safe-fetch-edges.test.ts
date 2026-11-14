// Edge cases of the safe retrieval: robots.txt grammar, transport failures, cache (SPEC-510 ET-1).
import { beforeEach, describe, expect, it } from 'vitest';

import { resolvePublicUrl } from './assert-public-url';
import {
  clearRobotsCache,
  isAllowedByRobots,
  safeFetch,
  type SafeFetchResponse,
} from './safe-fetch';

const PUBLIC = { address: '93.184.216.34', family: 4 } as const;
const publicLookup = () => Promise.resolve([PUBLIC]);

function body(text: string): AsyncIterable<Uint8Array> {
  return (async function* generate() {
    await Promise.resolve();
    yield new TextEncoder().encode(text);
  })();
}

function response(
  status: number,
  headers: Record<string, string | string[]> = {},
  text = '',
): SafeFetchResponse {
  return { status, headers, body: body(text) };
}

beforeEach(clearRobotsCache);

describe('[SPEC-510] grammaire de robots.txt', () => {
  it('ignore commentaires, lignes sans deux-points et règles sans agent', () => {
    const text = [
      '# commentaire',
      'ligne sans separateur',
      'Disallow: /orphan',
      'User-agent: learnybot # agent',
      'Disallow:',
      'Allow: /ok',
    ].join('\n');
    expect(isAllowedByRobots('LearnyBot/1.0', '/orphan', text)).toBe(true);
    expect(isAllowedByRobots('LearnyBot/1.0', '/ok', text)).toBe(true);
  });

  it('ouvre un nouveau groupe après des règles, et autorise sans règle applicable', () => {
    const text = [
      'User-agent: *',
      'Disallow: /prive',
      'User-agent: learnybot',
      'Disallow: /secret$',
      'Disallow: /img/*.png',
    ].join('\n');
    expect(isAllowedByRobots('LearnyBot/1.0', '/prive', text)).toBe(false);
    expect(isAllowedByRobots('LearnyBot/1.0', '/secret', text)).toBe(false);
    expect(isAllowedByRobots('LearnyBot/1.0', '/secret/plus', text)).toBe(true);
    expect(isAllowedByRobots('LearnyBot/1.0', '/img/a.png', text)).toBe(false);
    expect(isAllowedByRobots('LearnyBot/1.0', '/public', text)).toBe(true);
    expect(isAllowedByRobots('Autre/2.0', '/prive', text)).toBe(false);
  });
});

describe('[SPEC-510] échecs de transport et bornes', () => {
  it('traduit une annulation du transport en FETCH_TIMEOUT', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    await expect(
      safeFetch('https://example.test/a', {
        lookup: publicLookup,
        respectRobots: false,
        transport: () => Promise.reject(abort),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_TIMEOUT' });
  });

  it('traduit une erreur réseau en FETCH_FAILED avec sa cause', async () => {
    await expect(
      safeFetch('https://example.test/a', {
        lookup: publicLookup,
        respectRobots: false,
        transport: () => Promise.reject(new Error('ECONNRESET')),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED', status: 503 });
  });

  it('refuse une redirection sans en-tête Location', async () => {
    await expect(
      safeFetch('https://example.test/a', {
        lookup: publicLookup,
        respectRobots: false,
        transport: () => Promise.resolve(response(301)),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_HTTP_ERROR', status: 301 });
  });

  it('lit le premier en-tête quand il est multiple et signale une lecture interrompue', async () => {
    const broken: AsyncIterable<Uint8Array> = {
      // eslint-disable-next-line @typescript-eslint/require-await -- generator must be async
      async *[Symbol.asyncIterator]() {
        yield new TextEncoder().encode('deb');
        throw new Error('socket closed');
      },
    };
    await expect(
      safeFetch('https://example.test/a', {
        lookup: publicLookup,
        respectRobots: false,
        transport: () => Promise.resolve({ status: 200, headers: {}, body: broken }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });

    const result = await safeFetch('https://example.test/a', {
      lookup: publicLookup,
      respectRobots: false,
      transport: () =>
        Promise.resolve(response(200, { 'content-type': ['text/plain', 'text/html'] }, 'ok')),
    });
    expect(result.contentType).toBe('text/plain');
  });

  it('met robots.txt en cache par origine', async () => {
    const urls: string[] = [];
    const transport = (request: { url: URL }) => {
      urls.push(request.url.pathname);
      if (request.url.pathname === '/robots.txt') {
        return Promise.resolve(response(200, {}, 'User-agent: *\nDisallow: /prive'));
      }
      return Promise.resolve(response(200, {}, 'page'));
    };
    await safeFetch('https://example.test/a', { lookup: publicLookup, transport });
    await safeFetch('https://example.test/b', { lookup: publicLookup, transport });
    await expect(
      safeFetch('https://example.test/prive', { lookup: publicLookup, transport }),
    ).rejects.toMatchObject({ code: 'WEB_ROBOTS_DISALLOWED' });
    expect(urls).toEqual(['/robots.txt', '/a', '/b']);
  });
});

describe('[SPEC-505] resolvePublicUrl', () => {
  it('ne résout rien quand le privé est autorisé (ADR-0159 point 7)', async () => {
    const resolution = await resolvePublicUrl('http://ia.local:11434/v1', { allowPrivate: true });
    expect(resolution.addresses).toEqual([]);
  });

  it('refuse un hôte sans adresse', async () => {
    await expect(
      resolvePublicUrl('https://example.test/', { lookup: () => Promise.resolve([]) }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED_HOST' });
  });
});
