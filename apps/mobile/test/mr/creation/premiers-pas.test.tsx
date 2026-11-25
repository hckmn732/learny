// Jest + RNTL [quickfix mr-b] — premiers pas natifs, étape « Votre rythme » (maquette PremiersPas).
//
// L'écran rend l'étape 2 avec le rythme du serveur, puis enregistre un palier hebdomadaire, un
// jour de plus et un autre moment avant d'avancer à l'étape « ia ».
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { OnboardingState } from '@learny/contracts';

import { PremiersPasScreen } from '../../../src/features/mr/creation/PremiersPasScreen';
import { expectAccessible, expectMinTouchTarget } from '../../utils/expectAccessible';

const mockApi = {
  meOnboardingGet: jest.fn(),
  meOnboardingUpdate: jest.fn(),
  mePreferencesUpdate: jest.fn(),
  meUpdate: jest.fn(),
};

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ step: 'rythme' }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const ONBOARDING: OnboardingState = {
  profile: {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'alex@learny.test',
    firstName: 'Alex',
    lastName: null,
    tutorTone: 'vous',
    courseLanguage: 'fr',
    timezone: 'Europe/Paris',
    onboardingStep: 'rythme',
    onboardingCompletedAt: null,
    currentFormationId: null,
  },
  preferences: { hoursPerDay: 2, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] },
  reminders: { push: true, email: false, automations: true },
};

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <PremiersPasScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.meOnboardingGet.mockResolvedValue(ONBOARDING);
  mockApi.mePreferencesUpdate.mockResolvedValue({
    hoursPerDay: 3,
    studyDays: [1, 2, 3, 4, 5, 6],
    preferredSlots: ['matin'],
  });
  mockApi.meOnboardingUpdate.mockResolvedValue({ onboardingStep: 'ia' });
});

describe('[quickfix mr-b] premiers pas', () => {
  it('enregistre le rythme puis avance à l’étape IA', async () => {
    await renderScreen();
    expect(screen.getByTestId('qf-premiers-pas')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Votre rythme')).toBeTruthy();
    });
    expect(screen.getByText('Étape 2 sur 5')).toBeTruthy();
    expect(screen.getByText('10 h par semaine sur 5 jours')).toBeTruthy();
    expectAccessible(screen, 'qf-premiers-pas-back', { role: 'button', label: 'Retour' });
    expectMinTouchTarget(screen.getByTestId('qf-premiers-pas-day-1'), { height: 44 });

    await fireEvent.press(screen.getByTestId('qf-premiers-pas-week-15'));
    expect(screen.getByText('15 h par semaine sur 5 jours')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('qf-premiers-pas-day-6'));
    expect(screen.getByText('15 h par semaine sur 6 jours')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('qf-premiers-pas-slot-matin'));
    expect(screen.getByTestId('qf-premiers-pas-slot-matin').props.accessibilityState).toEqual({
      checked: true,
    });

    await fireEvent.press(screen.getByTestId('qf-premiers-pas-continue'));

    await waitFor(() => {
      expect(mockApi.mePreferencesUpdate).toHaveBeenCalledWith({
        body: {
          hoursPerDay: 3,
          studyDays: [1, 2, 3, 4, 5, 6],
          preferredSlots: ['matin'],
        },
      });
    });
    await waitFor(() => {
      expect(mockApi.meOnboardingUpdate).toHaveBeenCalledWith({ body: { step: 'ia' } });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/premiers-pas/ia');
    });
  });
});