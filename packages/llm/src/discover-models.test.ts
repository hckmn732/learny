import { describe, expect, it } from 'vitest';

import { chatModelIdsOf } from './discover-models';

describe('[SPEC-506] découverte des modèles de chat', () => {
  it('conserve uniquement les identifiants de chat déclarés ou plausibles', () => {
    expect(
      chatModelIdsOf({
        data: [
          { id: 'text-embedding-3-large', object: 'embedding' },
          { id: 'whisper-1' },
          { id: 'gpt-5.5' },
          { id: 'mistral-large-latest', capabilities: { completionChat: true } },
          { id: 'ignored', capabilities: { completionChat: false } },
          { id: 'model:latest', modalities: ['text', 'image'] },
          { id: 'tts-only', modalities: ['audio'] },
        ],
      }),
    ).toEqual(['gpt-5.5', 'mistral-large-latest', 'model:latest']);
  });
});
