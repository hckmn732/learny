// Jest + RNTL [SPEC-3305] — échauffement : question, révélation, « Je savais » / « À revoir », score
// (EF-5, CA-2).
import { fireEvent, render } from '@testing-library/react-native';

import { WarmupView } from '../../src/features/reviser/WarmupView';

import { WARMUP } from './fixtures';

function renderWarmup(overrides: Partial<Parameters<typeof WarmupView>[0]> = {}) {
  return render(
    <WarmupView
      warmup={WARMUP}
      position={0}
      revealed={false}
      pending={false}
      online
      error={null}
      onReveal={() => undefined}
      onAnswer={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />,
  );
}

describe('[SPEC-3305] échauffement (EF-5)', () => {
  it('affiche la question, son origine et le score de la première passe (CA-2)', async () => {
    const view = await renderWarmup();

    expect(await view.findByTestId('warmup-screen')).toBeTruthy();
    expect(view.getByTestId('warmup-question')).toHaveTextContent(
      'Quelle clé de comptabilisation pour un débit sur un compte général ?',
    );
    expect(view.getByTestId('warmup-progress')).toHaveTextContent('Question 1 sur 2');
    expect(view.getByText('Clé de comptabilisation')).toBeTruthy();
  });

  it('révèle la réponse puis remonte « Je savais » ou « À revoir » (BR-AUT-03)', async () => {
    const onReveal = jest.fn();
    const onAnswer = jest.fn();
    const view = await renderWarmup({ onReveal, onAnswer });

    await fireEvent.press(view.getByTestId('warmup-reveal'));
    expect(onReveal).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId('warmup-knew'));
    await fireEvent.press(view.getByTestId('warmup-again'));
    expect(onAnswer).toHaveBeenNthCalledWith(1, true);
    expect(onAnswer).toHaveBeenNthCalledWith(2, false);
  });

  it('affiche la réponse révélée et refuse les boutons hors ligne (EF-6)', async () => {
    const view = await renderWarmup({ revealed: true, online: false });

    expect(view.getByTestId('warmup-answer')).toHaveTextContent(
      '40. Et 50 pour un crédit sur un compte général.',
    );
    expect(view.getByTestId('warmup-offline')).toBeTruthy();
    const button = view.getByTestId('warmup-knew') as {
      props: { accessibilityState?: { disabled?: boolean } };
    };
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('montre le score final une fois l’échauffement terminé (BR-AUT-03)', async () => {
    const view = await renderWarmup({
      warmup: {
        ...WARMUP,
        status: 'done',
        answers: [
          { position: 0, knew: true },
          { position: 1, knew: false },
        ],
      },
    });

    expect(await view.findByTestId('warmup-done')).toBeTruthy();
    expect(view.getByTestId('warmup-score')).toHaveTextContent('1 sur 2');
  });
});
