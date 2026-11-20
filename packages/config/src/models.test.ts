import { describe, expect, it } from 'vitest';

import { AI_TASKS, BYOK_RECOMMENDED_MODELS, isAiTask } from './models';

describe('[SPEC-009] tâches IA', () => {
  it('isAiTask reconnaît les cinq tâches et rien d’autre', () => {
    for (const task of AI_TASKS) expect(isAiTask(task)).toBe(true);
    expect(isAiTask('autre')).toBe(false);
  });

  it('aucun modèle n’est recommandé par défaut pour Anthropic', () => {
    expect(BYOK_RECOMMENDED_MODELS.anthropic).toEqual([]);
  });
});
