// Unit tests of the cadrage projection (SPEC-604 EF-1, EF-5, ET-1, ET-2; CL-1). The transaction
// and the owner-role client are fakes: these tests pin the bounded profile, the question counter,
// the suggestion decoding, the pending question and the interrupted-turn error, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTx } from '@learny/db';

import {
  buildState,
  cadrageAlreadyCompleted,
  cadrageCompletedEventId,
  cadrageErrorMessage,
  emptyProfile,
  interruptedError,
  nextPosition,
  readFormation,
  readMessages,
  readProfile,
  suggestionsJson,
  toSummary,
  type FormationRow,
  type MessageRow,
} from './state';

const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const TUTOR = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({ serviceExecute: vi.fn() }));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: () => ({ execute: mocks.serviceExecute }),
}));

beforeEach(() => {
  mocks.serviceExecute.mockReset();
});

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

function message(partial: Partial<MessageRow> = {}): MessageRow {
  return {
    id: MESSAGE,
    role: 'tutor',
    content: 'Quel est le périmètre ?',
    question_key: 'scope',
    suggestions: null,
    position: 1,
    created_at: '2026-11-11T10:00:00Z',
    ...partial,
  };
}

function tx(rows: readonly unknown[][]): DbTx {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return { execute } as unknown as DbTx;
}

describe('[SPEC-604] état du cadrage', () => {
  it('complète un profil stocké borné et ignore les entrées invalides (BR-FOR-02)', () => {
    expect(readProfile(null)).toEqual(emptyProfile());
    expect(readProfile(['scope'])).toEqual(emptyProfile());
    expect(
      readProfile({
        scope: { value: 'SAP', state: 'done' },
        starting_point: { value: 42, state: 'unknown' },
        target_level: null,
        volume: [],
        dates: { value: '18 novembre', state: 'waiting' },
        extra: { value: 'ignoré', state: 'done' },
      }),
    ).toEqual({
      ...emptyProfile(),
      scope: { value: 'SAP', state: 'done' },
      starting_point: { value: null, state: 'todo' },
      dates: { value: '18 novembre', state: 'waiting' },
    });
  });

  it('numérote au plus cinq questions et expose la question en attente (EF-5)', () => {
    const rows: MessageRow[] = [];
    for (let index = 1; index <= 6; index += 1) {
      rows.push(
        message({
          id: `00000000-0000-4000-8000-00000000000${String(index)}`,
          content: `Question ${String(index)}`,
          question_key: index === 6 ? 'other' : 'scope',
          position: index,
          suggestions:
            index === 6
              ? [
                  { label: 'Oui', value: 'oui', multi: true },
                  { label: 'Non', value: 'non', multi: false },
                  { label: 'Ignoré' },
                  null,
                ]
              : [],
        }),
      );
    }

    const state = buildState(formation(), rows, null);

    expect(state.questionsAsked).toBe(5);
    expect(state.messages.at(-1)?.questionNumber).toBe(5);
    expect(state.pendingQuestion).toEqual({
      messageId: '00000000-0000-4000-8000-000000000006',
      questionKey: 'other',
      multi: true,
    });
    expect(state.messages.at(-1)?.suggestions).toEqual([
      { label: 'Oui', value: 'oui', description: null, multi: true },
      { label: 'Non', value: 'non', description: null, multi: false },
    ]);
    expect(state.messages[0]?.multi).toBe(false);
  });

  it('déduit la conclusion, la possibilité de générer et l’erreur interrompue (CL-1)', () => {
    const profile = {
      scope: { value: 'SAP', state: 'done' },
      target_level: { value: 'Certification', state: 'done' },
      starting_point: { value: null, state: 'waiting' },
      volume: { value: null, state: 'todo' },
      dates: { value: null, state: 'todo' },
    };
    const rows = [
      message({ id: TUTOR, question_key: 'scope', created_at: new Date('2026-11-11T10:00:00Z') }),
      message({ role: 'learner', question_key: null, content: 'La comptabilité.' }),
      message({ id: MESSAGE, question_key: null, content: 'Merci, c’est complet.' }),
    ];

    const finished = buildState(formation({ cadrage_profile: profile }), rows, null);
    expect(finished).toMatchObject({
      questionsAsked: 1,
      finished: true,
      canGenerate: true,
      pendingQuestion: null,
      error: null,
    });
    expect(finished.profile.scope).toEqual({ value: 'SAP', state: 'done' });

    const interrupted = buildState(formation(), rows.slice(0, 2), null);
    expect(interrupted.error).toEqual({
      code: 'AI_TASK_FAILED',
      message: 'Le tuteur n’a pas pu répondre.',
    });
    expect(interrupted.finished).toBe(false);

    const explicit = buildState(formation(), rows, {
      code: 'RATE_LIMITED',
      message: 'Trop de demandes.',
    });
    expect(explicit.error?.code).toBe('RATE_LIMITED');
  });

  it('décode les suggestions uniquement pour le tuteur et ignore le vide', () => {
    const state = buildState(
      formation(),
      [
        message({
          suggestions: [
            { label: 'Certification', value: 'exam', description: 'Préparer l’examen' },
            { label: 'Invalide' },
            null,
          ],
        }),
        message({ id: TUTOR, role: 'learner', question_key: null, suggestions: [] }),
      ],
      null,
    );
    expect(state.messages[0]?.suggestions).toEqual([
      { label: 'Certification', value: 'exam', description: 'Préparer l’examen', multi: false },
    ]);
    expect(state.messages[1]?.suggestions).toBeNull();
  });

  it('projette un résumé, les erreurs lisibles et l’événement stable', () => {
    expect(toSummary(formation({ status: 'active' }))).toEqual({
      id: FORMATION,
      title: 'SAP S/4HANA Finance',
      status: 'active',
    });
    expect(cadrageErrorMessage('AI_UNAVAILABLE')).toContain('Aucun modèle');
    expect(cadrageErrorMessage('RATE_LIMITED')).toContain('Patientez');
    expect(cadrageErrorMessage('INCONNU')).toBe('Le tuteur n’a pas pu répondre.');
    expect(cadrageErrorMessage('AI_TASK_FAILED')).toBe('Le tuteur n’a pas pu répondre.');
    expect(cadrageCompletedEventId(FORMATION)).toBe(`cadrage-completed:${FORMATION}`);
    expect(suggestionsJson([{ label: 'Oui', value: 'oui' }], true)).toBe(
      '[{"label":"Oui","value":"oui","multi":true}]',
    );
    expect(suggestionsJson([{ label: 'Oui', value: 'oui', description: 'Décrire' }], false)).toBe(
      '[{"label":"Oui","value":"oui","multi":false,"description":"Décrire"}]',
    );
  });

  it('détecte un dernier message apprenant comme tour interrompu', () => {
    expect(interruptedError([])).toBeNull();
    expect(interruptedError([message()])).toBeNull();
    expect(interruptedError([message({ role: 'learner', question_key: null })])).toEqual({
      code: 'AI_TASK_FAILED',
      message: 'Le tuteur n’a pas pu répondre.',
    });
  });

  it('lit la formation et les messages via le client de l’apprenant', async () => {
    const execute = vi.fn().mockResolvedValueOnce([formation()]).mockResolvedValueOnce([message()]);
    const client = { execute } as unknown as DbTx;

    await expect(readFormation(client, FORMATION, FORMATION)).resolves.toMatchObject({
      id: FORMATION,
      title: 'SAP S/4HANA Finance',
    });
    await expect(readMessages(client, FORMATION)).resolves.toEqual([message()]);
  });

  it('rend null une formation absente et calcule la position suivante', async () => {
    await expect(readFormation(tx([[]]), FORMATION, FORMATION)).resolves.toBeNull();
    await expect(nextPosition(tx([[]]), FORMATION)).resolves.toBe(1);
    await expect(nextPosition(tx([[{ next: 4 }]]), FORMATION)).resolves.toBe(4);
  });

  it('détecte une conclusion déjà demandée par l’événement d’outbox', async () => {
    mocks.serviceExecute.mockResolvedValueOnce([{ present: true }]);
    await expect(cadrageAlreadyCompleted(FORMATION)).resolves.toBe(true);

    mocks.serviceExecute.mockResolvedValueOnce([]);
    await expect(cadrageAlreadyCompleted(FORMATION)).resolves.toBe(false);
    expect(mocks.serviceExecute).toHaveBeenCalledTimes(2);
  });
});
