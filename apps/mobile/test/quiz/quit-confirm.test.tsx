// Jest + RNTL [SPEC-3304] — confirmation de sortie du quiz (EF-5, ET-4, CA-4 ; BR-QUI-02).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QuitConfirmSheet } from '../../src/features/quiz/QuitConfirmSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const onQuit = jest.fn();
const onCancel = jest.fn();

async function renderSheet(visible = true): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QuitConfirmSheet visible={visible} onQuit={onQuit} onCancel={onCancel} />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3304] confirmation de sortie du quiz', () => {
  beforeEach(() => {
    onQuit.mockClear();
    onCancel.mockClear();
  });

  it('affiche la question et les deux actions d’EF-5', async () => {
    await renderSheet();
    expect(screen.getByText('Quitter le quiz ?')).toBeTruthy();
    expect(
      screen.getByText('Vos réponses sont enregistrées, vous pourrez reprendre.'),
    ).toBeTruthy();
    expect(screen.getByTestId('quiz-quit-confirm')).toBeTruthy();
    expect(screen.getByTestId('quiz-quit-cancel')).toBeTruthy();
  });

  it('« Continuer » referme la confirmation sans quitter (EF-5)', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('quiz-quit-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('« Quitter » sort du quiz (EF-5, CA-4)', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('quiz-quit-confirm'));
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
