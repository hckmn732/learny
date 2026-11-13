import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { outgoingMessages } from './session';

const MARKER: ModelMessage[] = [
  { role: 'user', content: 'Question [[mock:demo-refusal]] importante' },
];

describe('[SPEC-504] injection du marqueur', () => {
  it("marqueur hors mock — en live, le texte est transmis tel quel et ne choisit rien", () => {
    const live = outgoingMessages('live', { system: [], messages: MARKER }, 'anthropic');
    expect(live).toEqual(MARKER);
    expect(JSON.stringify(live)).toContain('[[mock:demo-refusal]]');
  });

  it('en mock, le marqueur est retiré avant l’appel', () => {
    const mock = outgoingMessages('mock', { system: [], messages: MARKER }, 'anthropic');
    expect(mock).toEqual([{ role: 'user', content: 'Question  importante' }]);
  });
});
