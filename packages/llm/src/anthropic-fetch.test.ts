/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest matchers are typed as any. */
import { describe, expect, it } from 'vitest';

import { createAnthropicFetch, rewriteAnthropicInit } from './anthropic-fetch';

describe('[SPEC-504] réécriture du corps Anthropic', () => {
  it('CA-2 — injection des clés non prises en charge et nettoyage des échantillonnages', () => {
    const { body, headers } = rewriteAnthropicInit(
      {
        body: JSON.stringify({
          model: 'claude-opus-5-5',
          temperature: 0.7,
          top_p: 0.9,
          top_k: 10,
          thinking: { type: 'enabled', budget_tokens: 4096 },
          tool_choice: { type: 'tool', name: 'read_resources' },
          tools: [
            {
              name: 'read_resources',
              description: 'Lit',
              input_schema: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
          system: [
            { type: 'text', text: 'a', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'c', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'd', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'e', cache_control: { type: 'ephemeral' } },
          ],
          messages: [],
        }),
      },
      { task: 'programme', fallback: true },
    );
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.thinking).toEqual({ type: 'adaptive' });
    expect(parsed.output_config).toEqual({ effort: 'high' });
    expect(parsed.tool_choice).toEqual({ type: 'auto' });
    expect(parsed.tools).toEqual([
      expect.objectContaining({ strict: true, input_schema: expect.objectContaining({ additionalProperties: false }) }),
    ]);
    expect(parsed.fallbacks).toBe('default');
    expect(parsed).not.toHaveProperty('temperature');
    expect(parsed).not.toHaveProperty('top_p');
    expect(parsed).not.toHaveProperty('top_k');
    expect(JSON.stringify(parsed)).not.toContain('budget_tokens');
    expect((JSON.stringify(parsed).match(/"cache_control"/g) ?? []).length).toBe(4);
    expect(headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
  });

  it('CA-2 — pas de repli pour Haiku, aucun en-tête bêta privé ne fuit', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = createAnthropicFetch((input, init) => {
      captured = {
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init,
      };
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-learny-llm-task': 'tutor',
        'x-learny-llm-fallback': '1',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        fallbacks: 'default',
        system: [{ type: 'text', text: 'stable' }],
        messages: [],
      }),
    });
    const parsed = JSON.parse(
      typeof captured?.init?.body === 'string' ? captured.init.body : '{}',
    ) as Record<string, unknown>;
    expect(parsed.fallbacks).toBeUndefined();
    expect(parsed.output_config).toEqual({ effort: 'low' });
    const headers = new Headers(captured?.init?.headers);
    expect(headers.get('x-learny-llm-task')).toBeNull();
    expect(headers.get('x-learny-llm-fallback')).toBeNull();
    expect(headers.get('anthropic-beta')).toBeNull();
  });

  it('ET-4 — les autres routes (Files API) ne sont pas réécrites', async () => {
    let captured: string | undefined;
    const fetchImpl = createAnthropicFetch((input) => {
      captured = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const init: RequestInit = { method: 'POST', body: 'raw' };
    await fetchImpl('https://api.anthropic.com/v1/files', init);
    expect(captured).toBe('https://api.anthropic.com/v1/files');
  });
});
