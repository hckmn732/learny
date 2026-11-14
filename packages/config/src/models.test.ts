import { describe, expect, it } from 'vitest';

import { AI_TASKS, isAiTask, isProvidedModel } from './models';

describe('[SPEC-009] tâches et modèles fournis', () => {
  it('isAiTask reconnaît les cinq tâches et rien d’autre', () => {
    for (const task of AI_TASKS) expect(isAiTask(task)).toBe(true);
    expect(isAiTask('autre')).toBe(false);
  });

  it('isProvidedModel ne connaît que les identifiants fournis', () => {
    expect(isProvidedModel('claude-sonnet-5-5')).toBe(true);
    expect(isProvidedModel('gpt-x')).toBe(false);
  });
});
