// Unit tests of the web search providers (SPEC-512 CA-1, CA-3, CL-3, CL-4, CL-5; ET-2, ET-3).
// Everything is simulated: fixtures for the two routes, an injected fetch for the live Tavily
// decoding, and a network spy that must stay untouched in mock mode.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchWebOutput } from '@learny/contracts';

import type { ResolvedModel } from '../resolve';
import { estimateTokens } from '../types';

import {
  canonicalizeUrl,
  createProviderSearch,
  DEFAULT_SEARCH_SCENARIO,
  fitResultsToBudget,
  isPublicHttpUrl,
  normalizeSearchResults,
  runSearch,
  SEARCH_FIXTURES,
  SEARCH_FIXTURE_SCHEMA,
  searchFixture,
  searchProviderForResolved,
  TAVILY_ENDPOINT,
} from './index';

const ROOT = fileURLToPath(new URL('../../fixtures/search', import.meta.url));

function fixtureFiles(dir: string, prefix = ''): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return fixtureFiles(path.join(dir, entry.name), relative);
      return entry.name.endsWith('.json') ? [relative] : [];
    })
    .sort();
}

function resolved(provider: ResolvedModel['provider']): ResolvedModel {
  if (provider === 'anthropic') {
    return {
      kind: 'managed',
      provider: 'anthropic',
      modelId: 'claude-opus-5-5',
      task: 'programme',
    };
  }
  return {
    kind: 'byok',
    provider,
    modelId: 'gpt-demo',
    credentialId: '00000000-0000-4000-8000-000000000000',
    baseUrl: null,
    outsideEu: false,
    task: 'programme',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('[SPEC-512] Recherche web — fournisseurs', () => {
  it('CA-1, ET-3 — les fixtures des deux routes sont enregistrées et valides', () => {
    const onDisk = fixtureFiles(ROOT);
    const registered = SEARCH_FIXTURES.map(
      (fixture) => `${fixture.provider}/${fixture.scenario}.json`,
    ).sort();
    expect(registered).toEqual(onDisk);
    for (const fixture of SEARCH_FIXTURES) {
      expect(SEARCH_FIXTURE_SCHEMA.safeParse(fixture).success, fixture.scenario).toBe(true);
    }
    expect(DEFAULT_SEARCH_SCENARIO).toEqual({ anthropic: 'native', tavily: 'fallback' });
  });

  it('CA-1 — la route native et le repli rendent le même schéma normalisé', async () => {
    const native = createProviderSearch({ provider: 'anthropic', mode: 'mock' });
    const fallback = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      apiKey: 'tvly-mock',
    });
    expect(native.ok && fallback.ok).toBe(true);
    if (!native.ok || !fallback.ok) return;

    const request = { query: 'programme de révision en douze semaines', limit: 5 };
    const nativeResult = await runSearch(native.value, request);
    const fallbackResult = await runSearch(fallback.value, request);
    expect(nativeResult.ok && fallbackResult.ok).toBe(true);
    if (!nativeResult.ok || !fallbackResult.ok) return;

    expect(nativeResult.value.results).toHaveLength(3);
    expect(fallbackResult.value.results).toHaveLength(3);
    expect(nativeResult.value.results.map((result) => result.provider)).toEqual([
      'anthropic',
      'anthropic',
      'anthropic',
    ]);
    expect(fallbackResult.value.results.map((result) => result.provider)).toEqual([
      'tavily',
      'tavily',
      'tavily',
    ]);
    for (const result of [...nativeResult.value.results, ...fallbackResult.value.results]) {
      expect(SearchWebOutput.shape.results.element.safeParse(result).success).toBe(true);
      expect(result.url.startsWith('https://')).toBe(true);
    }
  });

  it('CA-3, CL-3, CL-4 — exclut liens actifs, adresses privées et doublons canoniques', async () => {
    const client = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      scenario: 'unsafe',
      apiKey: 'tvly-mock',
    });
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    const result = await runSearch(client.value, { query: 'fractions', limit: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.results).toHaveLength(2);
    const urls = result.value.results.map((entry) => entry.url);
    expect(urls).toEqual([
      'https://ressources.example.org/fractions',
      'https://example.org/page-publique',
    ]);
    expect(
      urls.some((url) => /javascript:|127\.0\.0\.1|192\.168\.|file:|user:pass/.test(url)),
    ).toBe(false);
    expect(result.value.results[0]?.snippet).toBe('Une fraction est un quotient de deux nombres.');
    expect(result.value.results[0]?.snippet).not.toContain('<script>');
    expect(result.value.results[1]?.snippet).toBe('Contenu lisible et sans script.');
    expect(result.value.results[1]?.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    for (const entry of result.value.results) expect(entry.provider).toBe('tavily');
  });

  it('CA-3 — canonicalise sans perdre la provenance ni les dates', async () => {
    const native = createProviderSearch({ provider: 'anthropic', mode: 'mock' });
    expect(native.ok).toBe(true);
    if (!native.ok) return;
    const result = await runSearch(native.value, { query: 'fractions', limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const first = result.value.results[0];
    expect(first?.url).toBe('https://ressources.example.org/fractions');
    expect(first?.publishedAt).toBe('2026-09-14T08:30:00.000Z');
    expect(first?.provider).toBe('anthropic');
    expect(result.value.results[1]?.publishedAt).toBe('2026-10-02T00:00:00.000Z');
  });

  it('CA-3, CL-5 — une réponse vide reste une liste vide, sans source inventée', async () => {
    const client = createProviderSearch({ provider: 'anthropic', mode: 'mock', scenario: 'empty' });
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    const result = await runSearch(client.value, { query: 'sujet sans résultat', limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results).toEqual([]);
    expect(result.value.limited).toBe(false);
  });

  it('EF-5 — un échec fournisseur est un SEARCH_UNAVAILABLE explicite', async () => {
    const client = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      scenario: 'unavailable',
      apiKey: 'tvly-mock',
    });
    if (!client.ok) throw client.error;
    const result = await client.value.search({ query: 'panne', limit: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
    expect(result.error.detail).not.toContain('tvly-');
  });

  it('CL-2 — sans clé Tavily, le repli est indisponible avant toute requête', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = createProviderSearch({ provider: 'tavily', mode: 'mock', apiKey: null });
    expect(client.ok).toBe(false);
    if (client.ok) return;
    expect(client.error.code).toBe('SEARCH_UNAVAILABLE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('EF-2 — la route native est choisie selon la capacité du fournisseur', () => {
    expect(searchProviderForResolved(resolved('anthropic'))).toBe('anthropic');
    for (const provider of [
      'openai',
      'mistral',
      'deepseek',
      'openai_compatible',
      'local',
    ] as const) {
      expect(searchProviderForResolved(resolved(provider))).toBe('tavily');
    }
  });

  it('ET-3 — le mode simulé ne fait aucun appel réseau', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('réseau interdit en mode simulé');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const anthropic = createProviderSearch({ provider: 'anthropic', mode: 'mock' });
    const tavily = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      apiKey: 'tvly-mock',
    });
    if (!anthropic.ok || !tavily.ok) throw new Error('clients simulés attendus');
    await runSearch(anthropic.value, { query: 'fractions', limit: 3 });
    await runSearch(tavily.value, { query: 'fractions', limit: 3 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ET-3 — le repli réel décode Tavily sans exposer la clé dans le corps', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      expect(url).toBe(TAVILY_ENDPOINT);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tvly-test-key');
      const rawBody = init?.body;
      if (typeof rawBody !== 'string') throw new Error('corps JSON attendu');
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      expect(body.query).toBe('fractions');
      expect(body.max_results).toBe(2);
      expect(JSON.stringify(body)).not.toContain('tvly-test-key');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Fractions',
                url: 'https://example.org/fractions',
                content: 'Une fraction est un quotient.',
                published_date: '2026-10-01',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    const client = createProviderSearch({
      provider: 'tavily',
      mode: 'live',
      apiKey: 'tvly-test-key',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    const result = await runSearch(client.value, { query: 'fractions', limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results[0]?.url).toBe('https://example.org/fractions');
    expect(result.value.results[0]?.provider).toBe('tavily');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('ET-3 — une erreur HTTP du repli reste sûre et explicite', async () => {
    const client = createProviderSearch({
      provider: 'tavily',
      mode: 'live',
      apiKey: 'tvly-test-key',
      fetch: () => Promise.resolve(new Response('clé refusée', { status: 401 })),
    });
    if (!client.ok) throw client.error;
    const result = await client.value.search({ query: 'fractions', limit: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
    expect(result.error.detail).not.toContain('clé refusée');
  });

  it('ET-2 — canonicalisation et refus des URL non publiques', () => {
    expect(canonicalizeUrl('https://WWW.Example.org/a/?utm_source=x&b=2&a=1#top')).toBe(
      'https://example.org/a?a=1&b=2',
    );
    expect(canonicalizeUrl('http://example.org/')).toBe('http://example.org/');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'http://127.0.0.1/x',
      'http://10.0.0.1/x',
      'http://172.16.5.4/x',
      'http://192.168.1.1/x',
      'http://169.254.1.1/x',
      'http://localhost/x',
      'http://serveur.local/x',
      'http://[::1]/x',
      'https://user:pass@example.org/x',
      'ftp://example.org/x',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
    expect(isPublicHttpUrl('https://example.org/page')).toBe(true);
  });

  it('EF-3 — le texte est coupé au budget de la tâche programme', () => {
    const long = 'a'.repeat(400);
    const results = Array.from({ length: 10 }, (_, index) => ({
      title: `Source ${String(index)}`,
      url: `https://example.org/source-${String(index)}`,
      snippet: long,
      provider: 'tavily' as const,
    }));
    const fitted = fitResultsToBudget(results, 320);
    expect(fitted.limited).toBe(true);
    expect(fitted.results.length).toBeGreaterThan(0);
    expect(fitted.results.length).toBeLessThan(results.length);
    expect(estimateTokens(JSON.stringify(fitted.results))).toBeLessThanOrEqual(320);
  });

  it('ET-2 — une fixture inconnue est indisponible, jamais inventée', () => {
    const result = searchFixture('anthropic', 'scenario-absent');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
  });

  it('ET-2 — les entrées non conformes sont ignorées sans casser la réponse', () => {
    const normalized = normalizeSearchResults(
      [
        null,
        42,
        { title: 'Sans URL', snippet: 'x' },
        { title: 'URL vide', url: '' },
        {
          title: '<b>Balise</b>',
          url: 'https://example.org/ok',
          snippet: '<script>x</script>Texte',
        },
      ],
      'anthropic',
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.title).toBe('Balise');
    expect(normalized[0]?.snippet).toBe('Texte');
  });
});
