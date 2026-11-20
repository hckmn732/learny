import { generateText, tool } from 'ai';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ResolvedModel } from '../resolve';

import { createLanguageModel } from './factory';

const urls: string[] = [];
const server = setupServer(
  http.post(/https:\/\/api\.deepseek\.com\/beta\/chat\/completions/, async ({ request }) => {
    urls.push(request.url);
    const body = (await request.json()) as { model: string; tools?: unknown[] };
    expect(body.tools).toBeDefined();
    expect(JSON.stringify(body.tools)).toContain('"strict":true');
    return HttpResponse.json({
      id: 'chat-1',
      object: 'chat.completion',
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }),
);

beforeAll(() => {
  server.listen();
});
afterAll(() => {
  server.close();
});

function resolved(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
  return {
    kind: 'byok',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    credentialId: 'credential',
    baseUrl: null,
    outsideEu: true,
    task: 'tutor',
    ...overrides,
  };
}

describe('[SPEC-504] provider base URLs', () => {
  it('DeepSeek uses /beta so strict tools reach the network', async () => {
    const model = createLanguageModel(resolved(), { apiKey: 'deepseek-test-only' });
    await generateText({
      model,
      prompt: 'bonjour',
      tools: {
        read_resources: tool({
          description: 'Lit une ressource',
          inputSchema: z.object({ query: z.string() }),
          strict: true,
        }),
      },
    });
    expect(urls).toEqual(['https://api.deepseek.com/beta/chat/completions']);
  });

  it('keeps explicit provider URLs and default SDK URLs for other providers', () => {
    const deepseek = createLanguageModel(
      resolved({ baseUrl: 'https://proxy.example/beta' }),
      { apiKey: 'deepseek-test-only' },
    );
    const openai = createLanguageModel(
      resolved({ provider: 'openai', modelId: 'gpt-test', baseUrl: null }),
      { apiKey: 'openai-test-only' },
    );
    expect(deepseek).toBeDefined();
    expect(openai).toBeDefined();
  });
});
