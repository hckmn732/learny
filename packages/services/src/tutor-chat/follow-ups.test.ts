import { describe, expect, it } from 'vitest';

import { buildFollowUps, compareLabel } from './follow-ups';

describe('[SPEC-610] suites proposées par le code', () => {
  it('propose toujours trois suites et la comparaison quand une confusion existe', () => {
    const keys = buildFollowUps({
      confusion: { left: 'Clé de comptabilisation', right: 'Type de pièce' },
    }).map((entry) => entry.key);
    expect(keys).toEqual(['rephrase', 'example', 'compare', 'test_me']);
    expect(compareLabel({ left: 'Clé de comptabilisation', right: 'Type de pièce' })).toBe(
      'Clé ou type de pièce ?',
    );
    expect(buildFollowUps({ confusion: null }).map((entry) => entry.key)).toEqual([
      'rephrase',
      'example',
      'test_me',
    ]);
  });

  it('ne repropose pas la suite qui vient d’être servie', () => {
    const keys = buildFollowUps({ confusion: null, served: 'example' }).map((entry) => entry.key);
    expect(keys).not.toContain('example');
    expect(keys).toContain('test_me');
  });
});
