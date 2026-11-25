// Jest + RNTL [SPEC-3102] — garde d'onboarding (BR-ACC-04, CA-3, CL-4).
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OnboardingGateScreen } from '../../src/features/shell/OnboardingGateScreen';
import { OnboardingGuard } from '../../src/features/shell/OnboardingGuard';
import type { OnboardingQuery } from '../../src/features/shell/use-shell';

const mockRedirect = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockUseOnboarding = jest.fn<OnboardingQuery, []>();

jest.mock('../../src/features/shell/use-shell', () => ({
  useOnboarding: () => mockUseOnboarding(),
}));

describe('[SPEC-3102] garde d’onboarding', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockReplace.mockClear();
    mockUseOnboarding.mockReset();
  });

  it('ne laisse voir que l’écran de garde tant que la configuration n’est pas finie (CA-3)', async () => {
    mockUseOnboarding.mockReturnValue({
      status: 'ready',
      step: 'ia',
      completed: false,
      retry: jest.fn(),
      refresh: jest.fn(),
    });
    await render(
      <OnboardingGuard>
        <></>
      </OnboardingGuard>,
    );
    expect(mockRedirect).toHaveBeenCalledWith('/terminer-sur-le-web');
  });

  it('ouvre la coquille quand la configuration est terminée', async () => {
    mockUseOnboarding.mockReturnValue({
      status: 'ready',
      step: 'done',
      completed: true,
      retry: jest.fn(),
      refresh: jest.fn(),
    });
    await render(
      <OnboardingGuard>
        <></>
      </OnboardingGuard>,
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('montre l’attente puis l’erreur avec « Réessayer »', async () => {
    mockUseOnboarding.mockReturnValue({
      status: 'loading',
      step: null,
      completed: false,
      retry: jest.fn(),
      refresh: jest.fn(),
    });
    const loading = await render(
      <OnboardingGuard>
        <></>
      </OnboardingGuard>,
    );
    expect(loading.getByTestId('onboarding-loading')).toBeTruthy();

    const retry = jest.fn();
    mockUseOnboarding.mockReturnValue({
      status: 'error',
      step: null,
      completed: false,
      retry,
      refresh: jest.fn(),
    });
    const failed = await render(
      <OnboardingGuard>
        <></>
      </OnboardingGuard>,
    );
    await fireEvent.press(failed.getByTestId('onboarding-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('ouvre les premiers pas natifs, sans bouton « J’ai terminé » (quickfix)', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <OnboardingGateScreen />
      </SafeAreaProvider>,
    );

    expect(view.getByTestId('onboarding-gate')).toBeTruthy();
    expect(view.getByText('Terminez votre configuration')).toBeTruthy();
    expect(view.getByTestId('onboarding-bot')).toBeTruthy();
    expect(view.queryByTestId('onboarding-done')).toBeNull();

    await fireEvent.press(view.getByTestId('onboarding-continue'));
    expect(mockReplace).toHaveBeenCalledWith('/premiers-pas/1');
  });
});
