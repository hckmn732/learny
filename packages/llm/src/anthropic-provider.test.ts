/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest matchers are typed as any. */
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';


import { createAnthropicFetch, LEARNY_TASK_HEADER } from './anthropic-fetch';
import { buildAnthropicOptions, buildAnthropicSystem } from './anthropic-options';

const bodies: Record<string, unknown>[] = [];
const headersSeen: Headers[] = [];

const server = setupServer(
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    bodies.push(body);
    headersSeen.push(new Headers(request.headers));
    return HttpResponse.json({
      id: `msg_${String(bodies.length)}`,
      type: 'message',
      role: 'assistant',
      model: typeof body.model === 'string' ? body.model : 'test-model-a',
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 2 },
    });
  }),
);

beforeAll(() => {
  server.listen();
});
afterAll(() => {
  server.close();
});

const MODEL = createAnthropicFetch();
const PROVIDER = createAnthropic({ apiKey: 'sk-ant-test', fetch: MODEL });

describe('[SPEC-504] corps de requête Anthropic (MSW)', () => {
  it.each([
    ['programme', 'test-model-a', 'high'],
    ['course', 'test-model-a', 'medium'],
    ['gaps', 'test-model-a', 'medium'],
    ['tutor', 'test-model-b', 'low'],
    ['light', 'test-model-c', 'low'],
  ] as const)('CA-2 — %s : thinking adaptatif et effort %s', async (task, modelId, effort) => {
    bodies.length = 0;
    headersSeen.length = 0;
    const options = buildAnthropicOptions({ task, modelId });
    const system = buildAnthropicSystem([
      { text: 'Consigne stable', cache: true },
      { text: 'Question', cache: false },
    ]);
    const model = PROVIDER(modelId);
    await generateText({
      model,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- AI SDK 7 alias of instructions.
      ...(system === undefined ? {} : { system }),
      messages: [{ role: 'user', content: 'Bonjour' }],
      tools: {
        read_resources: tool({
          description: 'Lit les passages',
          inputSchema: z.object({ query: z.string() }),
          strict: true,
        }),
      },
      toolChoice: 'auto',
      headers: { [LEARNY_TASK_HEADER]: task },
      providerOptions: options.providerOptions,
    });
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort });
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('budget_tokens');
    expect(body.tools).toEqual([
      expect.objectContaining({
        name: 'read_resources',
        strict: true,
        input_schema: expect.objectContaining({ additionalProperties: false }),
      }),
    ]);
    const sentSystem = body.system as {
      type: string;
      text: string;
      cache_control?: unknown;
    }[];
    expect(sentSystem.at(-1)?.cache_control).toBeUndefined();
    expect(sentSystem.filter((part) => part.cache_control !== undefined)).toHaveLength(1);
    expect(sentSystem[0]?.text).toBe('Consigne stable');
    expect(body.fallbacks).toBeUndefined();
    expect(headersSeen[0]?.get('anthropic-beta') ?? '').not.toContain('fallback');
    expect(headersSeen[0]?.get(LEARNY_TASK_HEADER)).toBeNull();
  });
});
