import { describe, expect, it } from 'vitest';

import { buildTutorChatPrompt, TUTOR_CHAT_PROMPT_ID, TUTOR_CHAT_PROMPT_VERSIONS } from './prompt';

describe('[SPEC-610] consignes de la discussion', () => {
  it('versionne la consigne, applique le ton et la langue, et transmet un bloc de données', () => {
    expect(TUTOR_CHAT_PROMPT_VERSIONS.chat).toBeGreaterThanOrEqual(1);
    const built = buildTutorChatPrompt({
      profile: { tone: 'tu', courseLanguage: 'fr' },
      includedKeys: ['formation', 'chapter'],
      contextBlock: '<context></context>',
      history: [{ role: 'learner', content: 'Bonjour' }],
      message: 'Explique autrement',
      gapFirst: false,
    });
    expect(built.id).toBe(TUTOR_CHAT_PROMPT_ID);
    expect(built.system[0]?.text).toContain('tu');
    expect(built.system[0]?.text).not.toContain('{{tone}}');
    expect(built.messages.at(-1)?.content).toContain(
      '<learner-message>Explique autrement</learner-message>',
    );
  });
});
