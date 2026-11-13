// Unit tests of the tutor-turn persistence (SPEC-604 ET-2). The transaction is a fake: these
// tests pin the objective merge, the profile write, the message position and the suggestion JSON,
// not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { DbTx } from '@learny/db';
import type { AppliedTutorTurn } from '@learny/tutor';

import { TestClock } from '../../test/support/fakes';

import { persistTutorTurn } from './persist';
import type { FormationRow } from './state';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';

function formation(partial: Partial<FormationRow> = {}): FormationRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    status: 'cadrage',
    cadrage_profile: {},
    objectives: [],
    course_language: 'fr',
    ...partial,
  };
}

function applied(partial: Partial<AppliedTutorTurn> = {}): AppliedTutorTurn {
  return {
    profile: {
      scope: { value: 'SAP', state: 'done' },
      starting_point: { value: null, state: 'waiting' },
      target_level: { value: null, state: 'todo' },
      volume: { value: null, state: 'todo' },
      dates: { value: null, state: 'todo' },
    },
    objectives: ['operational'],
    questionsAsked: 1,
    finished: false,
    questionNumber: 2,
    questionKey: 'starting_point',
    multi: false,
    suggestions: [{ label: 'Débutant', value: 'debutant' }],
    content: 'Où en êtes-vous ?',
    ...partial,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

describe('[SPEC-604] persistance d’un tour de tuteur', () => {
  it('fusionne les objectifs et insère le message à la position suivante (ET-2)', async () => {
    const execute = sequence([[], [{ next: 2 }], [{ id: MESSAGE }]]);

    const result = await persistTutorTurn(
      { execute } as unknown as DbTx,
      formation({ objectives: ['operational'] }),
      USER,
      applied({ objectives: ['operational', 'exam'] }),
      new TestClock('2026-11-11T12:20:00Z'),
    );

    expect(result).toEqual({
      content: 'Où en êtes-vous ?',
      questionKey: 'starting_point',
      suggestions: '[{"label":"Débutant","value":"debutant","multi":false}]',
      messageId: MESSAGE,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('conserve les objectifs existants et un message sans suggestion', async () => {
    const execute = sequence([[], [], []]);

    const result = await persistTutorTurn(
      { execute } as unknown as DbTx,
      formation({ objectives: ['exam'] }),
      USER,
      applied({ objectives: [], suggestions: null, questionKey: null, questionNumber: null }),
      new TestClock('2026-11-11T12:20:00Z'),
    );

    expect(result).toEqual({
      content: 'Où en êtes-vous ?',
      questionKey: null,
      suggestions: null,
      messageId: '',
    });
  });

  it('n’écrit aucune liste d’objectifs quand les deux sources sont vides', async () => {
    const execute = sequence([[], [], [{ id: MESSAGE }]]);

    await persistTutorTurn(
      { execute } as unknown as DbTx,
      formation({ objectives: [] }),
      USER,
      applied({ objectives: [] }),
      new TestClock('2026-11-11T12:20:00Z'),
    );

    expect(execute).toHaveBeenCalledTimes(3);
  });
});
