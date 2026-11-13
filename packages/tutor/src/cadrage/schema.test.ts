import { describe, expect, it } from 'vitest';

import { CadrageTurnSchema } from './schema';

describe('[SPEC-604] schéma CadrageTurn', () => {
  it('ET-3 — accepte une question complète et ses suggestions', () => {
    const parsed = CadrageTurnSchema.safeParse({
      profileUpdates: [{ key: 'scope', value: 'Comptabilité' }],
      objectives: ['operational'],
      next: {
        kind: 'question',
        questionKey: 'target_level',
        text: 'Quel niveau visez-vous ?',
        multi: true,
        suggestions: [
          { label: 'Autonome', description: 'Au quotidien', value: 'Autonome' },
          { label: 'Certification', value: 'Certification' },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('ET-3 — accepte une conclusion sans question', () => {
    expect(
      CadrageTurnSchema.safeParse({
        profileUpdates: [],
        objectives: ['exam'],
        next: { kind: 'done', text: 'Merci.' },
      }).success,
    ).toBe(true);
  });

  it('ET-3 — refuse un champ inconnu (mode strict)', () => {
    expect(
      CadrageTurnSchema.safeParse({
        profileUpdates: [],
        objectives: [],
        next: { kind: 'done', text: 'Merci.' },
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('ET-3 — refuse une question sans texte, plus de six suggestions ou un objectif inconnu', () => {
    const base = {
      profileUpdates: [],
      objectives: [],
      next: { kind: 'question', questionKey: 'scope', text: '', multi: false, suggestions: [] },
    };
    expect(CadrageTurnSchema.safeParse(base).success).toBe(false);
    expect(
      CadrageTurnSchema.safeParse({
        ...base,
        next: { ...base.next, text: 'Question', suggestions: Array.from({ length: 7 }, () => ({ label: 'a', value: 'b' })) },
      }).success,
    ).toBe(false);
    expect(
      CadrageTurnSchema.safeParse({ ...base, next: { kind: 'done', text: 'x' }, objectives: ['other'] })
        .success,
    ).toBe(false);
  });
});
