import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, ok, type Clock, type Result } from '@learny/core';
import { settings } from '@learny/i18n/fr/settings';

import type { StepInput } from '../types';

import { evaluateTaskCompatibility, type CompatibilitySession } from './compatibility';

const FIXED = new Date('2026-11-11T12:20:00Z');
const clock: Clock = { now: () => new Date(FIXED) };

function session(fail: 'tools' | 'structured' | 'vision' | null): {
  session: CompatibilitySession;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    session: {
      object: <S extends z.ZodType>(
        input: Omit<StepInput, 'tools'> & { schema: S },
      ): Promise<Result<z.infer<S>>> => {
        const text = JSON.stringify(input.messages);
        const probe = text.includes('"image"') ? 'vision' : 'structured';
        calls.push(probe);
        if (fail === probe) {
          return Promise.resolve({
            ok: false,
            error: new AppError('INVALID_OUTPUT', 'Échec simulé.'),
          });
        }
        return Promise.resolve(
          ok(
            input.schema.parse(
              probe === 'vision'
                ? { visible: true }
                : { compatible: true, summary: 'Sortie structurée disponible.' },
            ),
          ),
        );
      },
      step: () => {
        calls.push('tools');
        return fail === 'tools'
          ? Promise.resolve({
              ok: false as const,
              error: new AppError('AI_PROVIDER_ERROR', 'Échec simulé.'),
            })
          : Promise.resolve(
              ok({
                text: '',
                toolCalls: [
                  {
                    toolCallId: 'tool-1',
                    toolName: 'compatibility_probe',
                    input: { value: 'ok' },
                  },
                ],
                finishReason: 'tool-calls' as const,
                usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
                responseMessages: [],
                modelId: 'model-a',
              }),
            );
      },
    },
  };
}

describe('[SPEC-506] compatibilité par tâche', () => {
  it('sonde uniquement les capacités exigées par TASK_CONFIG', async () => {
    const gaps = session(null);
    await evaluateTaskCompatibility({
      credentialId: '11111111-1111-4111-8111-111111111111',
      modelId: 'model-a',
      task: 'gaps',
      clock,
      session: gaps.session,
    });
    expect(gaps.calls).toEqual(['structured']);

    const tutor = session(null);
    await evaluateTaskCompatibility({
      credentialId: '11111111-1111-4111-8111-111111111111',
      modelId: 'model-a',
      task: 'tutor',
      clock,
      session: tutor.session,
    });
    expect(tutor.calls).toEqual(['structured', 'tools']);

    const light = session(null);
    await evaluateTaskCompatibility({
      credentialId: '11111111-1111-4111-8111-111111111111',
      modelId: 'model-a',
      task: 'light',
      clock,
      session: light.session,
    });
    expect(light.calls).toEqual(['structured', 'vision']);
  });

  it.each([
    ['tutor', 'tools', 'NO_TOOLS'],
    ['light', 'vision', 'NO_VISION'],
    ['gaps', 'structured', 'STRUCTURED_UNRELIABLE'],
  ] as const)('rend une réserve non bloquante %s / %s', async (task, failure, code) => {
    const probe = session(failure);
    const result = await evaluateTaskCompatibility({
      credentialId: '11111111-1111-4111-8111-111111111111',
      modelId: 'model-a',
      task,
      clock,
      session: probe.session,
    });
    expect(result).toMatchObject({
      status: 'reserve',
      reserveCodes: [code],
      checkedAt: FIXED.toISOString(),
      reasons: [{ code, message: settings.aiModels.compatibilityReserveMessages[code] }],
    });
  });

  it('termine après le budget global avec CHECK_TIMEOUT et lance les sondes en parallèle', async () => {
    let started = 0;
    const pending = new Promise<never>(() => undefined);
    const probe: CompatibilitySession = {
      object: () => {
        started += 1;
        return pending;
      },
      step: () => {
        started += 1;
        return pending;
      },
    };
    const began = performance.now();
    const result = await evaluateTaskCompatibility({
      credentialId: '11111111-1111-4111-8111-111111111111',
      modelId: 'slow-model',
      task: 'tutor',
      clock,
      session: probe,
      timeoutMs: 20,
    });
    expect(performance.now() - began).toBeLessThan(100);
    expect(started).toBe(2);
    expect(result.status).toBe('reserve');
    expect(result.reserveCodes).toEqual(['CHECK_TIMEOUT']);
    expect(result.reasons[0]?.message).toContain('15 secondes');
  });
});
