import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '@learny/core';

import {
  assertCitationsCompatible,
  buildAnthropicOptions,
  buildAnthropicRequestPreview,
  buildAnthropicSystem,
} from './anthropic-options';

describe('[SPEC-504] options Anthropic', () => {
  it('CA-2 — chaque tâche porte la réflexion adaptative et son effort', () => {
    const tasks = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;
    const efforts = ['high', 'medium', 'medium', 'low', 'low'];
    tasks.forEach((task, index) => {
      const options = buildAnthropicOptions({
        task,
        modelId: 'test-model',
      });
      expect(options.providerOptions.anthropic.thinking).toEqual({ type: 'adaptive' });
      expect(options.providerOptions.anthropic.effort).toBe(efforts[index]);
      expect(JSON.stringify(options)).not.toContain('budget_tokens');
      expect(JSON.stringify(options)).not.toContain('temperature');
    });
  });

  it('CA-2 — aucun repli serveur n’est jamais demandé', () => {
    const options = buildAnthropicOptions({ task: 'programme', modelId: 'test-model' });
    expect(options.providerOptions.anthropic).not.toHaveProperty('fallbacks');
    expect(options.providerOptions.anthropic).not.toHaveProperty('anthropicBeta');
  });

  it('CA-2 — les parties stables passent en tête, seule la dernière est mise en cache', () => {
    const system = buildAnthropicSystem([
      { text: 'instructions', cache: true },
      { text: 'programme', cache: true },
      { text: 'question datée', cache: false },
    ]);
    expect(system?.map((message) => message.content)).toEqual([
      'instructions',
      'programme',
      'question datée',
    ]);
    expect(system?.[0]?.providerOptions).toBeUndefined();
    expect(system?.[1]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(system?.[2]?.providerOptions).toBeUndefined();
  });

  it('CA-2 — l’aperçu contient outils stricts, additionalProperties false et tool_choice auto', () => {
    const preview = buildAnthropicRequestPreview({
      task: 'programme',
      modelId: 'test-model',
      structured: false,
      system: [{ text: 'Consigne stable', cache: true }],
      tools: {
        read_resources: {
          description: 'Lit les passages utiles',
          inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1) }),
        },
      },
    });
    expect(preview.thinking).toEqual({ type: 'adaptive' });
    expect(preview.output_config.effort).toBe('high');
    expect(preview.tool_choice).toEqual({ type: 'auto' });
    expect(preview.tools?.[0]).toMatchObject({ name: 'read_resources', strict: true });
    expect(preview.tools?.[0]?.input_schema).toMatchObject({ additionalProperties: false });
    expect(preview.system?.[0]).toMatchObject({
      text: 'Consigne stable',
      cache_control: { type: 'ephemeral' },
    });
    expect(preview).not.toHaveProperty('fallbacks');
    expect(JSON.stringify(preview)).not.toContain('budget_tokens');
    expect(preview).not.toHaveProperty('temperature');
  });

  it('EF-4 — citations et sortie structurée sont refusées avant tout appel', () => {
    expect(() => { assertCitationsCompatible({ citations: true, structured: true }); }).toThrow(AppError);
    try {
      assertCitationsCompatible({ citations: true, structured: true });
    } catch (error) {
      expect((error as AppError).code).toBe('CITATIONS_WITH_STRUCTURED_OUTPUT');
    }
    expect(() => { assertCitationsCompatible({ citations: true, structured: false }); }).not.toThrow();
  });

  it('EF-4 — un document utilise file_id et active les citations', () => {
    const preview = buildAnthropicRequestPreview({
      task: 'course',
      modelId: 'test-model',
      documents: [{ fileId: 'file_123' }],
      citations: true,
    });
    expect(preview.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'file', file_id: 'file_123' },
            citations: { enabled: true },
          },
        ],
      },
    ]);
  });
});
