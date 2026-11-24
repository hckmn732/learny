// Jest + RNTL [SPEC-3305] — mode hors ligne : bandeau, correction locale, échéances masquées
// (EF-8, EF-9, CA-3, BR-MEM-02).
import { act, render } from '@testing-library/react-native';

import { localGrade } from '../../src/bricks/responses';
import { toBrickCorrection } from '../../src/features/reviser/answers';
import { ReviewSession } from '../../src/features/reviser/ReviewSession';
import { setOnlineForDemo } from '../../src/offline/network';

const NOW = new Date('2026-11-11T12:20:00.000Z');

function renderOffline() {
  return render(
    <ReviewSession
      session={{
        sessionId: '00000000-0000-4000-8000-000000000010',
        attemptId: '00000000-0000-4000-8000-000000000011',
        formationId: '00000000-0000-4000-8000-000000000012',
        forDate: '2026-11-11',
        mode: 'full',
        status: 'in_progress',
        header: {
          notionCount: 14,
          modulesLabel: 'Modules 1 et 2 mêlés',
          estimatedMinutes: 10,
          subtitle: 'SAP S/4HANA Finance',
        },
        modeOptions: { fullMinutes: 10, microMinutes: 5 },
        note: '',
        rationale: [],
        tuned: [],
        smoothing: null,
        items: [
          {
            position: 0,
            brickId: 'b0',
            brickVersionId: '00000000-0000-4000-8000-000000000030',
            type: 'recall_card',
            name: 'Carte de rappel',
            tech: 'active recall',
            displayLabel: 'Variante',
            scopeLabel: 'Module 3',
            reason: null,
            notionIds: ['00000000-0000-4000-8000-000000000001'],
            payload: {
              front: 'Que définit une variante d’exercice comptable ?',
              back: 'Le nombre de périodes comptables et leurs dates.',
              sources: [],
            },
            intervals: {
              again: '2026-11-11T12:30:00.000Z',
              hard: '2026-11-21T12:20:00.000Z',
              good: '2026-11-23T12:20:00.000Z',
              easy: '2026-11-27T12:20:00.000Z',
            },
            state: 'todo',
            result: null,
          },
        ],
        currentPosition: 0,
        summary: null,
      }}
      position={0}
      timeZone="Europe/Paris"
      now={NOW}
      online={false}
      pending={false}
      answerError={false}
      completeError={false}
      streakDays={12}
      summary={null}
      offlineEnded={false}
      correction={undefined}
      response={undefined}
      warmup={null}
      toast={null}
      onGrade={() => undefined}
      onResponse={() => undefined}
      onSubmit={() => undefined}
      onSkip={() => undefined}
      onNext={() => undefined}
      onClose={() => undefined}
      onUndo={() => undefined}
      onHome={() => undefined}
    />,
  );
}

afterEach(async () => {
  await act(() => {
    setOnlineForDemo(true);
  });
});

describe('[SPEC-3305] session hors ligne (EF-8, CA-3)', () => {
  it('affiche le bandeau et masque les échéances FSRS (BR-MEM-02)', async () => {
    await act(() => {
      setOnlineForDemo(false);
    });
    const view = await renderOffline();

    expect(await view.findByTestId('review-offline-banner')).toBeTruthy();
    // Aucune note FSRS côté client : les boutons restent, l'échéance disparaît (BR-MEM-02).
    expect(view.getByTestId('review-grade-good')).toBeTruthy();
    expect(view.queryByText(/Revient/)).toBeNull();
  });

  it('corrige localement une carte de rappel avec gradeBrick (CA-3)', () => {
    const result = localGrade(
      'recall_card',
      {
        front: 'Que définit une variante d’exercice comptable ?',
        back: 'Le nombre de périodes comptables et leurs dates.',
        sources: [],
      },
      { selfGrade: 'good' },
      '00000000-0000-4000-8000-000000000030',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isCorrect).toBe(true);
    expect(toBrickCorrection('recall_card', result.value.correction)).toMatchObject({
      kind: 'recall_card',
      selfGrade: 'good',
    });
  });

  it('traduit la correction d’association du contrat vers le rendu natif (CA-3)', () => {
    const correction = toBrickCorrection('matching', {
      kind: 'matching',
      pairs: [
        {
          leftId: 'p1',
          rightId: 'r3',
          ok: true,
          expectedRightId: 'r3',
          expectedLeftLabel: 'Société',
        },
      ],
    });

    expect(correction).toMatchObject({
      kind: 'matching',
      pairs: [{ pairId: 'p1', givenRight: 'r3', correct: true }],
    });
  });
});
