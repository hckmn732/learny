import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { brickExamples } from './examples';
import { brickFingerprint } from './fingerprint';
import { sha256Hex } from './sha256';

const choice = brickExamples.choice_question.valid;

function withStem(stem: string): typeof choice {
  return {
    ...choice,
    stem,
    options: choice.options.map((option) => ({
      ...option,
      text:
        option.id === 'a'
          ? 'Le compte de banque'
          : option.id === 'b'
            ? 'Le compte de capital'
            : 'Le compte de résultat',
    })),
  };
}

describe('[SPEC-501] empreinte des questions', () => {
  it('produit 64 caractères hexadécimaux', () => {
    const fingerprint = brickFingerprint('choice_question', choice);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignore casse, accents, espaces, apostrophes typographiques et ponctuation finale (CA-3)', () => {
    const left = withStem('Quel compte augmente au débit ?');
    const right = withStem('  QUEL COMPTE AUGMENTE AU DÉBIT  ');
    expect(brickFingerprint('choice_question', left)).toBe(
      brickFingerprint('choice_question', right),
    );
  });

  it('change si la bonne réponse change (CA-3)', () => {
    const changed = {
      ...choice,
      options: choice.options.map((option) => ({
        ...option,
        correct: option.id === 'b',
      })),
    };
    expect(brickFingerprint('choice_question', changed)).not.toBe(
      brickFingerprint('choice_question', choice),
    );
  });

  it('n’a pas d’empreinte pour un type non question', () => {
    expect(brickFingerprint('text', brickExamples.text.valid)).toBeNull();
  });

  it('calcule les empreintes des six autres types question', () => {
    for (const type of [
      'open_question',
      'cloze',
      'matching',
      'ordering',
      'categorization',
      'recall_card',
    ] as const) {
      expect(brickFingerprint(type, brickExamples[type].valid)).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('[SPEC-501] SHA-256 isomorphe', () => {
  it.each(['', 'abc', 'Learny — débit/crédit', 'x'.repeat(200), '😀 injection'])(
    'égale node:crypto pour %j',
    (value) => {
      const expected = createHash('sha256').update(value, 'utf8').digest('hex');
      expect(sha256Hex(value)).toBe(expected);
    },
  );
});
