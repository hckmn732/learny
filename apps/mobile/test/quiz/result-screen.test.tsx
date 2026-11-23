// Jest + RNTL [SPEC-3304] — écran de résultat et ses suites (EF-7, CA-3 ; BR-QUI-05, BR-QUI-06,
// BR-QUI-08, BR-AUT-04).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ResultScreen } from '../../src/features/quiz/ResultScreen';

import { result } from './fixtures';

const onNextModule = jest.fn();
const onRemediation = jest.fn();
const onRetry = jest.fn();
const onHome = jest.fn();

async function renderResult(overrides: Parameters<typeof result>[0] = {}): Promise<void> {
  await render(
    <ResultScreen
      result={result(overrides)}
      timeZone="Europe/Paris"
      onNextModule={onNextModule}
      onRemediation={onRemediation}
      onRetry={onRetry}
      onHome={onHome}
    />,
  );
}

describe('[SPEC-3304] écran de résultat', () => {
  beforeEach(() => {
    onNextModule.mockClear();
    onRemediation.mockClear();
    onRetry.mockClear();
    onHome.mockClear();
  });

  it('affiche le score, le seuil et le verdict du serveur (BR-QUI-08)', async () => {
    await renderResult();
    expect(screen.getByText('58 %')).toBeTruthy();
    expect(screen.getByText('Seuil 80 %')).toBeTruthy();
    expect(screen.getByTestId('result-verdict-label')).toHaveTextContent('Pas encore');
    expect(screen.getByText('22 point(s) manquant(s) pour le seuil')).toBeTruthy();
  });

  it('liste le score par notion, les lacunes avec leur nature et l’historique (BR-QUI-08)', async () => {
    await renderResult();
    expect(screen.getByTestId('result-notion-00000000-0000-4000-8000-0000000000aa')).toBeTruthy();
    const gap = screen.getByTestId('result-gap-00000000-0000-4000-8000-0000000000aa');
    expect(gap).toBeTruthy();
    expect(screen.getByText('Oubli')).toBeTruthy();
    expect(screen.getByTestId('result-history-1')).toBeTruthy();
    expect(screen.getByTestId('result-history-2')).toBeTruthy();
  });

  it('propose la remédiation sur le web et la date de nouvelle tentative (BR-QUI-06, CL-5)', async () => {
    await renderResult();
    expect(screen.getByText('Continuer sur le web')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('result-remediation'));
    expect(onRemediation).toHaveBeenCalledTimes(1);
    const retry = screen.getByTestId('result-retry');
    const state = retry.props.accessibilityState as { disabled?: boolean } | undefined;
    expect(state?.disabled).toBe(true);
    expect(retry).toHaveTextContent('Nouvelle tentative possible 12/11/2026 13:20');
    expect(screen.queryByTestId('result-next-module')).toBeNull();
  });

  it('ouvre le module suivant après une réussite (BR-QUI-05)', async () => {
    await renderResult({
      score: 88,
      passed: true,
      pointsMissing: null,
      gaps: [],
      retry: {
        allowed: true,
        availableAt: null,
        reason: null,
        remediationRequired: false,
        remediationDone: false,
      },
    });
    expect(screen.getByTestId('result-verdict-label')).toHaveTextContent('Module validé');
    await fireEvent.press(screen.getByTestId('result-next-module'));
    expect(onNextModule).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('result-retry')).toBeNull();
  });

  it('signale une correction du tuteur en cours (CL-6)', async () => {
    await renderResult({ score: null, provisionalScore: 70, passed: null, pendingOpenCount: 1 });
    expect(screen.getByTestId('result-pending')).toBeTruthy();
    expect(screen.getByText('Correction du tuteur en cours')).toBeTruthy();
  });
});
