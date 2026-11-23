// Jest + RNTL [SPEC-3303] — « Teste-moi » dans le fil du tuteur (BR-TUT-04, CA-1).
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { TutorSheet } from '../../src/features/tuteur/TutorSheet';

import { HANDLERS, learnerMessage, snapshotOf, tutorMessage } from './fixtures';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function renderSheet(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

const PENDING = snapshotOf({
  messages: [
    learnerMessage('Teste-moi sur les deux dates.', 'm-question'),
    tutorMessage({
      id: 'm-self-test',
      text: 'Une question, sans regarder le cours :\n\nQuelle date fixe la période comptable ?',
      sources: [],
      followUps: [],
      selfTest: { status: 'pending' },
    }),
  ],
  selfTestPending: true,
});

describe('[SPEC-3303] Teste-moi', () => {
  it('affiche la question en attente et le champ de réponse (BR-TUT-04)', async () => {
    const view = await renderSheet(
      <TutorSheet state={PENDING} subtitle="Cours" online {...HANDLERS} />,
    );
    expect(view.getByTestId('tutor-self-test')).toBeTruthy();
    expect(view.getByTestId('tutor-self-test-input').props.accessibilityLabel).toBe(
      'Votre réponse à la question du tuteur',
    );
    expect(view.getByTestId('tutor-self-test-submit').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('corrige la réponse saisie (BR-TUT-04)', async () => {
    const onAnswerSelfTest = jest.fn();
    const view = await renderSheet(
      <TutorSheet
        state={PENDING}
        subtitle="Cours"
        online
        {...HANDLERS}
        onAnswerSelfTest={onAnswerSelfTest}
      />,
    );
    await fireEvent.changeText(view.getByTestId('tutor-self-test-input'), 'La date de pièce.');
    await waitFor(() => {
      expect(view.getByTestId('tutor-self-test-submit').props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(view.getByTestId('tutor-self-test-submit'));
    expect(onAnswerSelfTest).toHaveBeenCalledWith('La date de pièce.');
  });

  it('affiche la correction du tuteur comme un message du fil', async () => {
    const corrected = snapshotOf({
      messages: [
        learnerMessage('Teste-moi sur les deux dates.', 'm-question'),
        tutorMessage({
          id: 'm-self-test',
          text: 'Une question, sans regarder le cours :\n\nQuelle date fixe la période comptable ?',
          sources: [],
          followUps: [],
          selfTest: { status: 'answered', correct: true, masteryBefore: 40, masteryAfter: 65 },
        }),
        tutorMessage({
          id: 'm-correction',
          text: 'Juste : la date de pièce fixe la période.',
          sources: [],
          followUps: [],
        }),
      ],
      selfTestPending: false,
    });
    const view = await renderSheet(
      <TutorSheet state={corrected} subtitle="Cours" online {...HANDLERS} />,
    );
    expect(view.queryByTestId('tutor-self-test')).toBeNull();
    expect(view.getByTestId('tutor-message-2-markdown')).toHaveTextContent(
      'Juste : la date de pièce fixe la période.',
    );
  });
});
