// Jest + RNTL [SPEC-3304] — écran du quiz : vérifier, verrouillage, en-tête, absence de chronomètre
// (EF-2, EF-4, CA-1, CA-2 ; BR-QUI-04, BR-QUI-07).
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { QuizFeedback } from '@learny/contracts';

import { QuizScreen } from '../../src/features/quiz/QuizScreen';

import { attempt } from './fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const CORRECT: QuizFeedback = {
  isCorrect: true,
  score: 100,
  explanation: 'Le type de pièce classe toute la pièce.',
  title: 'Exact.',
  correction: {
    kind: 'choice_question',
    explanation: 'Le type de pièce classe toute la pièce.',
    options: [
      { id: 'novembre', text: 'Novembre', correct: false, chosen: false },
      { id: 'octobre', text: 'Octobre', correct: true, chosen: true },
    ],
  },
};

const onCheck = jest.fn(() => Promise.resolve(CORRECT));
const onSave = jest.fn();
const onFinish = jest.fn(() => Promise.resolve());
const onQuit = jest.fn();

/** `accessibilityState.disabled` of one control (RNTL types it as `any`). */
function isDisabled(testID: string): boolean {
  const state = screen.getByTestId(testID).props.accessibilityState as
    { disabled?: boolean } | undefined;
  return state?.disabled === true;
}

async function renderQuiz(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QuizScreen
        attempt={attempt()}
        onCheck={onCheck}
        onSave={onSave}
        onFinish={onFinish}
        onQuit={onQuit}
      />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3304] écran du quiz', () => {
  beforeEach(() => {
    onCheck.mockClear();
    onSave.mockClear();
    onFinish.mockClear();
    onQuit.mockClear();
  });

  it('affiche « Question 1 sur 2 », « Tentative 2 · seuil 80 % » et la mention BR-QUI-07 (CA-2)', async () => {
    await renderQuiz();
    expect(screen.getByText('Question 1 sur 2')).toBeTruthy();
    expect(screen.getByText('Tentative 2 · seuil 80 %')).toBeTruthy();
    expect(
      screen.getByText('Correction immédiate · nouvelles questions à chaque tentative'),
    ).toBeTruthy();
    expect(screen.getByTestId('quiz-progress')).toBeTruthy();
    // CA-2 / ADR-3003 § 2 — aucun chronomètre dans le quiz de validation.
    expect(screen.queryByText('08:42')).toBeNull();
    expect(screen.queryByTestId('quiz-timer')).toBeNull();
  });

  it('désactive « Vérifier » tant qu’aucune réponse n’est choisie (EF-4)', async () => {
    await renderQuiz();
    expect(isDisabled('quiz-check')).toBe(true);
  });

  it('vérifie la réponse choisie, affiche la correction et verrouille (CA-1)', async () => {
    await renderQuiz();
    await fireEvent.press(screen.getByTestId('brick-option-1'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }));
    expect(isDisabled('quiz-check')).toBe(false);

    await fireEvent.press(screen.getByTestId('quiz-check'));
    await waitFor(() => {
      expect(onCheck).toHaveBeenCalledTimes(1);
    });
    expect(onCheck).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1, response: { optionIds: ['octobre'] } }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('quiz-next')).toBeTruthy();
    });
    // BR-QUI-04 — la réponse est verrouillée : un nouvel appui ne rappelle pas la sélection.
    onSave.mockClear();
    await fireEvent.press(screen.getByTestId('brick-option-0'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Exact.')).toBeTruthy();
  });

  it('passe à la question suivante et termine sur la dernière (EF-4)', async () => {
    await renderQuiz();
    await fireEvent.press(screen.getByTestId('brick-option-1'));
    await fireEvent.press(screen.getByTestId('quiz-check'));
    await waitFor(() => {
      expect(screen.getByTestId('quiz-next')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('quiz-next'));
    expect(screen.getByText('Question 2 sur 2')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('brick-option-1'));
    await fireEvent.press(screen.getByTestId('quiz-check'));
    await waitFor(() => {
      expect(screen.getByTestId('quiz-finish')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('quiz-finish'));
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });
});
