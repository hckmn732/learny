import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_BY_TASK, THINKING_EFFORT_BY_TASK } from '@learny/config';

import { defaultModelForTask, needsProviderStreaming, TASK_CONFIG } from './tasks';

describe('[SPEC-504] tâches et modèles par défaut', () => {
  it('CA-1 — les cinq tâches lisent le modèle de @learny/config (BR-IA-01)', () => {
    for (const task of ['programme', 'course', 'gaps', 'tutor', 'light'] as const) {
      expect(defaultModelForTask(task)).toBe(DEFAULT_MODEL_BY_TASK[task]);
    }
    expect(defaultModelForTask('programme')).toBe('claude-opus-5-5');
    expect(defaultModelForTask('tutor')).toBe('claude-sonnet-5-5');
    expect(defaultModelForTask('light')).toBe('claude-haiku-5-5');
  });

  it('ET-1 — budgets, efforts et capacités sont ceux de la spécification', () => {
    expect(TASK_CONFIG.programme).toMatchObject({ effort: 'high', maxOutputTokens: 32000 });
    expect(TASK_CONFIG.course).toMatchObject({ effort: 'medium', maxOutputTokens: 64000 });
    expect(TASK_CONFIG.gaps).toMatchObject({ effort: 'medium', maxOutputTokens: 16000 });
    expect(TASK_CONFIG.tutor).toMatchObject({ effort: 'low', maxOutputTokens: 8000 });
    expect(TASK_CONFIG.light).toMatchObject({ effort: 'low', maxOutputTokens: 4000 });
    expect(TASK_CONFIG.programme.capabilities).toContain('web_search');
    expect(TASK_CONFIG.light.capabilities).toContain('vision');
    // `light` reste à low : la réflexion ne peut pas être coupée partout (SPEC-504 §15).
    expect(THINKING_EFFORT_BY_TASK.light).toBe('none');
    expect(TASK_CONFIG.light.effort).toBe('low');
  });

  it('ET-1 — seuls les budgets > 16 000 passent par le flux fournisseur', () => {
    expect(needsProviderStreaming('programme')).toBe(true);
    expect(needsProviderStreaming('course')).toBe(true);
    expect(needsProviderStreaming('gaps')).toBe(false);
    expect(needsProviderStreaming('tutor')).toBe(false);
    expect(needsProviderStreaming('light')).toBe(false);
  });
});
