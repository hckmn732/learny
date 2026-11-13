import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  applyTutorTurn,
  type ApplyTutorTurnConstraints,
  type CadrageProfile,
} from './apply-tutor-turn';
import { CadrageTurnSchema, type CadrageTurn } from './schema';

const FALLBACK = 'Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez.';

function profile(): CadrageProfile {
  return {
    scope: { value: null, state: 'todo' },
    starting_point: { value: null, state: 'todo' },
    target_level: { value: null, state: 'todo' },
    volume: { value: null, state: 'todo' },
    dates: { value: null, state: 'todo' },
  };
}

function turn(value: unknown): CadrageTurn {
  return CadrageTurnSchema.parse(value);
}

function constraints(overrides: Partial<ApplyTutorTurnConstraints> = {}): ApplyTutorTurnConstraints {
  return { questionsAsked: 0, doneFallback: FALLBACK, ...overrides };
}

const question = (overrides: Record<string, unknown> = {}) =>
  turn({
    profileUpdates: [],
    objectives: [],
    next: {
      kind: 'question',
      questionKey: 'scope',
      text: 'Quel périmètre ?',
      multi: false,
      suggestions: [],
      ...overrides,
    },
  });

describe('[SPEC-604] applyTutorTurn', () => {
  it('CA-1 — passage todo → waiting → done d’une rubrique', () => {
    const waiting = applyTutorTurn(profile(), question(), constraints());
    expect(waiting.profile.scope).toEqual({ value: null, state: 'waiting' });
    expect(waiting.questionsAsked).toBe(1);
    expect(waiting.questionNumber).toBe(1);

    const done = applyTutorTurn(
      waiting.profile,
      turn({
        profileUpdates: [{ key: 'scope', value: 'Comptabilité générale' }],
        objectives: [],
        next: {
          kind: 'question',
          questionKey: 'starting_point',
          text: 'Votre point de départ ?',
          multi: false,
          suggestions: [],
        },
      }),
      constraints({ questionsAsked: 1, pendingQuestionKey: 'scope', learnerAnswer: 'Comptabilité' }),
    );
    expect(done.profile.scope).toEqual({ value: 'Comptabilité générale', state: 'done' });
    expect(done.profile.starting_point.state).toBe('waiting');
    expect(done.questionsAsked).toBe(2);
  });

  it('CA-4 — une sixième question devient la conclusion par défaut', () => {
    const applied = applyTutorTurn(
      profile(),
      question({ questionKey: 'dates' }),
      constraints({ questionsAsked: 5 }),
    );
    expect(applied.finished).toBe(true);
    expect(applied.questionsAsked).toBe(5);
    expect(applied.content).toBe(FALLBACK);
    expect(applied.suggestions).toBeNull();
  });

  it('CA-4 — une conclusion déjà prononcée ne peut plus poser de question', () => {
    const applied = applyTutorTurn(
      profile(),
      question(),
      constraints({ questionsAsked: 2, finished: true }),
    );
    expect(applied.finished).toBe(true);
    expect(applied.content).toBe(FALLBACK);
  });

  it('ET-3 — un choix multiple sans deux suggestions est refusé', () => {
    expect(() =>
      applyTutorTurn(
        profile(),
        question({
          multi: true,
          suggestions: [{ label: 'Une', value: 'une' }],
        }),
        constraints(),
      ),
    ).toThrowError(AppError);
  });

  it('ET-3 — les valeurs de suggestions doivent être uniques', () => {
    expect(() =>
      applyTutorTurn(
        profile(),
        question({
          suggestions: [
            { label: 'Une', value: 'x' },
            { label: 'Deux', value: 'x' },
          ],
        }),
        constraints(),
      ),
    ).toThrow('uniques');
  });

  it('ET-3 — une valeur de rubrique est tronquée à 200 caractères', () => {
    const long = 'a'.repeat(250);
    const applied = applyTutorTurn(
      profile(),
      turn({
        profileUpdates: [{ key: 'scope', value: long }],
        objectives: [],
        next: { kind: 'done', text: FALLBACK },
      }),
      constraints(),
    );
    expect(applied.profile.scope.value).toHaveLength(200);
  });

  it('BR-FOR-03 — les objectifs sont dédoublonnés', () => {
    const applied = applyTutorTurn(
      profile(),
      turn({
        profileUpdates: [],
        objectives: ['exam', 'operational', 'exam'],
        next: { kind: 'done', text: FALLBACK },
      }),
      constraints(),
    );
    expect(applied.objectives).toEqual(['exam', 'operational']);
  });

  it('CL-1 — la réponse de l’apprenant complète la rubrique si le tuteur l’oublie', () => {
    const applied = applyTutorTurn(
      profile(),
      turn({
        profileUpdates: [],
        objectives: [],
        next: { kind: 'done', text: FALLBACK },
      }),
      constraints({ pendingQuestionKey: 'scope', learnerAnswer: 'Les immobilisations' }),
    );
    expect(applied.profile.scope).toEqual({ value: 'Les immobilisations', state: 'done' });
    expect(applied.profile.dates.state).toBe('todo');
  });
});
