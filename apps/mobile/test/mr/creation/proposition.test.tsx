// Jest + RNTL [quickfix mr-b] — programme proposé (maquette Proposition.dc.html).
//
// Le client d'API est simulé au registre ; l'écran rend la proposition du serveur, ouvre la
// feuille d'ajustement, envoie la demande au tuteur puis valide la nouvelle version.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { OnboardingState, ProgrammeProposalStateDto } from '@learny/contracts';

import { PropositionScreen } from '../../../src/features/mr/creation/PropositionScreen';
import { expectAccessible, expectMinTouchTarget } from '../../utils/expectAccessible';

const FID = '00000000-0000-4000-8000-0000000000b2';

const mockApi = {
  programmeGet: jest.fn(),
  meOnboardingGet: jest.fn(),
  programmeGenerate: jest.fn(),
  programmeAdjust: jest.fn(),
  programmeValidate: jest.fn(),
};

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ fid: '00000000-0000-4000-8000-0000000000b2' }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function proposalState(version: number, status: 'proposed' | 'active'): ProgrammeProposalStateDto {
  return {
    formationId: FID,
    title: 'SAP S/4HANA Finance',
    description: null,
    formationStatus: status === 'active' ? 'active' : 'programme_proposed',
    cadrageCompleted: true,
    proposal: {
      formationId: FID,
      version,
      source: 'generated',
      proposalStatus: status,
      title: 'SAP S/4HANA Finance',
      description: null,
      summary: null,
      volumeHours: 10,
      createdAt: '2026-11-11T12:20:00Z',
      modules: [
        {
          position: 1,
          title: 'Les fondamentaux',
          objectives: ['Comprendre les écritures'],
          plannedStart: '2026-11-16',
          plannedEnd: '2026-11-22',
          threshold: 80,
          chapters: [
            {
              position: 1,
              title: 'Écritures et plan de comptes',
              notions: [
                { label: 'Débit', definition: 'Un débit augmente un compte d’actif.' },
                { label: 'Crédit', definition: 'Un crédit augmente un compte de passif.' },
                { label: 'Plan de comptes', definition: 'Liste structurée des comptes.' },
              ],
            },
          ],
          status: null,
        },
        {
          position: 2,
          title: 'Clôture mensuelle',
          objectives: ['Clôturer un mois'],
          plannedStart: '2026-11-23',
          plannedEnd: '2027-01-18',
          threshold: 80,
          chapters: [
            {
              position: 1,
              title: 'Clôture',
              notions: [{ label: 'Provisions', definition: 'Charges à payer rattachées.' }],
            },
          ],
          status: null,
        },
      ],
      versions: [
        {
          version,
          source: 'generated',
          createdAt: '2026-11-11T12:20:00Z',
          current: true,
        },
      ],
      activeFormationCount: 0,
    },
  };
}

const ONBOARDING: OnboardingState = {
  profile: {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'alex@learny.test',
    firstName: 'Alex',
    lastName: null,
    tutorTone: 'tu',
    courseLanguage: 'fr',
    timezone: 'Europe/Paris',
    onboardingStep: 'done',
    onboardingCompletedAt: '2026-11-11T12:20:00Z',
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
        <PropositionScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.meOnboardingGet.mockResolvedValue(ONBOARDING);
});

describe('[quickfix mr-b] proposition', () => {
  it('affiche le programme proposé, l’ajuste puis le valide', async () => {
    mockApi.programmeGet.mockResolvedValue(proposalState(1, 'proposed'));
    mockApi.programmeAdjust.mockResolvedValue(proposalState(2, 'proposed'));
    mockApi.programmeValidate.mockResolvedValue(proposalState(2, 'active'));

    await renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Ton programme SAP S/4HANA Finance')).toBeTruthy();
    });
    expect(screen.getByText('2 modules')).toBeTruthy();
    expect(screen.getByText('10 h / semaine')).toBeTruthy();
    expect(screen.getByText('Fin prévue 18 janv.')).toBeTruthy();
    expect(screen.getByText('Les fondamentaux')).toBeTruthy();
    expect(screen.getByText('3 notions · 8 h')).toBeTruthy();
    expectAccessible(screen, 'qf-proposition-reorder-1', {
      role: 'button',
      label: 'Réordonner ce module',
    });
    expectMinTouchTarget(screen.getByTestId('qf-proposition-start'), { height: 44 });

    await fireEvent.press(screen.getByTestId('qf-proposition-adjust'));
    expect(screen.getByTestId('qf-proposition-adjust-sheet')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId('qf-proposition-adjust-input'),
      'Moins de théorie sur les écritures',
    );
    await fireEvent.press(screen.getByTestId('qf-proposition-adjust-submit'));

    await waitFor(() => {
      expect(mockApi.programmeAdjust).toHaveBeenCalledWith(
        {
          params: { fid: FID },
          body: { expectedVersion: 1, message: 'Moins de théorie sur les écritures' },
        },
        { idempotencyKey: expect.any(String) as string },
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId('qf-proposition-adjust-sheet')).toBeNull();
    });

    await fireEvent.press(screen.getByTestId('qf-proposition-start'));
    await waitFor(() => {
      expect(mockApi.programmeValidate).toHaveBeenCalledWith(
        { params: { fid: FID }, body: { expectedVersion: 2 } },
        { idempotencyKey: expect.any(String) as string },
      );
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/programme');
    });
  });
});