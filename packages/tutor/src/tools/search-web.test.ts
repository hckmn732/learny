// Unit tests of the `search_web` action (SPEC-512 CA-1, CA-2, CA-3, CL-1 to CL-5; ET-1 to ET-4).
// The provider is always a fake: no network, no database, no clock from the machine.
import { describe, expect, it } from 'vitest';

import { SearchWebOutput, SearchWebQuery, type SearchWebProvider } from '@learny/contracts';
import { ok, type Result } from '@learny/core';
import { createLogCapture, createLogger, type LearnyLogger } from '@learny/core/server';
import type { SearchProviderClient, SearchProviderRequest } from '@learny/llm';

import { guardSearchWeb, searchWeb, searchWebTool, type SearchWebContext } from './search-web';

interface Calls {
  requests: SearchProviderRequest[];
}

function fakeClient(
  provider: SearchWebProvider,
  calls: Calls,
  results: unknown[],
): SearchProviderClient {
  return {
    provider,
    search: (request): Promise<Result<unknown[]>> => {
      calls.requests.push(request);
      return Promise.resolve(ok(results));
    },
  };
}

function client(
  provider: SearchWebProvider,
  results: unknown[] = [],
): {
  calls: Calls;
  client: SearchProviderClient;
} {
  const calls: Calls = { requests: [] };
  return { calls, client: fakeClient(provider, calls, results) };
}

function context(overrides: Partial<SearchWebContext> = {}): SearchWebContext {
  return {
    task: 'programme',
    userId: '00000000-0000-4000-8000-000000000001',
    mode: 'mock',
    ...overrides,
  };
}

const RESULTS = [
  {
    title: '<b>Fractions</b>',
    url: 'https://www.ressources.example.org/fractions/?utm_source=x#top',
    snippet: '<script>alert(1)</script>Une fraction est un quotient.',
    publishedAt: '2026-09-14T08:30:00.000Z',
  },
  {
    title: 'Doublon',
    url: 'https://ressources.example.org/fractions',
    snippet: 'Doublon canonique.',
  },
  {
    title: 'Lien actif',
    url: 'javascript:alert(1)',
    snippet: 'Interdit.',
  },
];

function loggerCapture(): { logger: LearnyLogger; text: () => string } {
  const capture = createLogCapture();
  return {
    logger: createLogger({ destination: capture.destination, level: 'info' }),
    text: () => capture.text(),
  };
}

describe('[SPEC-512] Recherche web', () => {
  it('CA-2, CL-1 — refuse les tâches cours, lacunes, tuteur et légère avant tout appel', async () => {
    for (const task of ['course', 'gaps', 'tutor', 'light'] as const) {
      const { calls, client: provider } = client('anthropic', RESULTS);
      const result = await searchWeb(context({ task, provider }), {
        query: 'une recherche',
        purpose: 'programme',
        limit: 5,
      });
      expect(result.ok, task).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('TOOL_NOT_ALLOWED');
      expect(result.error.detail).toBe(
        'La recherche web ne sert qu’à concevoir le programme et à suggérer des ressources.',
      );
      expect(calls.requests).toEqual([]);
    }
  });

  it('CA-2 — le guard est pur et utilisable par la boucle avant exécution', () => {
    const query = SearchWebQuery.parse({
      query: 'programme de révision',
      purpose: 'resource_suggestion',
      limit: 3,
    });
    expect(guardSearchWeb({ task: 'programme' }, query)).toBeNull();
    expect(guardSearchWeb({ task: 'course' }, query)?.code).toBe('TOOL_NOT_ALLOWED');
  });

  it('CA-1, CA-3 — normalise, déduplique et conserve la provenance avant le modèle', async () => {
    const { calls, client: provider } = client('anthropic', RESULTS);
    const result = await searchWeb(context({ provider }), {
      query: '  fractions  ',
      purpose: 'programme',
      limit: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toBe('fractions');
    expect(result.value.provider).toBe('anthropic');
    expect(result.value.results).toHaveLength(1);
    expect(result.value.results[0]).toMatchObject({
      title: 'Fractions',
      url: 'https://ressources.example.org/fractions',
      snippet: 'Une fraction est un quotient.',
      provider: 'anthropic',
    });
    expect(result.value.message).toBeNull();
    expect(calls.requests).toEqual([{ query: 'fractions', limit: 5 }]);
    expect(SearchWebOutput.safeParse(result.value).success).toBe(true);
  });

  it('CA-1 — le repli Tavily rend exactement le même schéma avec sa provenance', async () => {
    const { client: provider } = client('tavily', [
      {
        title: 'Gérer son temps',
        url: 'https://etudes-exemple.org/temps',
        content: 'Planifier des séances courtes.',
        published_date: '2026-10-21',
      },
    ]);
    const result = await searchWeb(context({ provider }), {
      query: 'gérer son temps',
      purpose: 'resource_suggestion',
      limit: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tavily');
    expect(result.value.purpose).toBe('resource_suggestion');
    expect(result.value.results).toEqual([
      {
        title: 'Gérer son temps',
        url: 'https://etudes-exemple.org/temps',
        snippet: 'Planifier des séances courtes.',
        publishedAt: '2026-10-21T00:00:00.000Z',
        provider: 'tavily',
      },
    ]);
  });

  it('ET-1, ET-4 — l’entrée est validée avant tout appel fournisseur', async () => {
    const { calls, client: provider } = client('anthropic', RESULTS);
    const invalid = [
      { query: 'a', purpose: 'programme', limit: 5 },
      { query: 'requête', purpose: 'cours', limit: 5 },
      { query: 'requête', purpose: 'programme', limit: 11 },
      { query: 'requête', purpose: 'programme', limit: 0 },
      { query: 'requête', purpose: 'programme', limit: 5, extra: true },
    ];
    for (const input of invalid) {
      const result = await searchWeb(context({ provider }), input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
    expect(calls.requests).toEqual([]);
  });

  it('CL-2 — un fournisseur sans recherche native et sans clé Tavily est indisponible', async () => {
    const result = await searchWeb(
      context({ providerName: 'tavily', secrets: { searchApiKey: null } }),
      { query: 'programme de révision', purpose: 'programme', limit: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
  });

  it('CL-5 — une liste vide est honnête et ne contient aucune source inventée', async () => {
    const { client: provider } = client('anthropic', []);
    const result = await searchWeb(context({ provider }), {
      query: 'sujet sans résultat',
      purpose: 'programme',
      limit: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results).toEqual([]);
    expect(result.value.message).toBe(
      'Aucun résultat trouvé. Aucune source n’est inventée : continuez sans résultat web.',
    );
  });

  it('ET-4 — le journal ne contient ni la requête, ni une URL, ni une clé', async () => {
    const { logger, text } = loggerCapture();
    const { client: provider } = client('tavily', RESULTS);
    const result = await searchWeb(
      context({
        provider,
        logger,
        secrets: { searchApiKey: 'tvly-secret-key' },
      }),
      { query: 'fractions secrètes', purpose: 'programme', limit: 5 },
    );
    expect(result.ok).toBe(true);
    const logs = text();
    expect(logs).toContain('queryLength');
    expect(logs).toContain('resultCount');
    expect(logs).not.toContain('fractions secrètes');
    expect(logs).not.toContain('ressources.example.org');
    expect(logs).not.toContain('tvly-secret-key');
  });

  it('EF-1 — le registre n’expose search_web qu’à la tâche programme', async () => {
    const { toolAllowedForTask, TUTOR_TOOLS } = await import('./index');
    expect(TUTOR_TOOLS.search_web.name).toBe('search_web');
    expect(toolAllowedForTask('programme', 'search_web')).toBe(true);
    for (const task of ['course', 'gaps', 'tutor', 'light'] as const) {
      expect(toolAllowedForTask(task, 'search_web')).toBe(false);
    }
  });

  it('ET-4 — le descripteur expose les schémas Zod d’entrée et de sortie', () => {
    expect(
      searchWebTool.inputSchema.safeParse({ query: 'fractions', purpose: 'programme' }).success,
    ).toBe(true);
    expect(searchWebTool.outputSchema.safeParse({}).success).toBe(false);
  });
});
