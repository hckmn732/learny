// Jest + RNTL [SPEC-3202] — disposition du FAB Android (EF-1, § 10; CA-1, BR-PLA-02).
//
// The mockup puts a lime 56 dp FAB above the navigation bar, and the specification requires that
// it never covers a button. With no layout engine in Jest, the proof is on the geometry: the list
// keeps a bottom clearance of at least the FAB height plus its distance to the bottom edge.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  PROGRAMME_FAB_BOTTOM,
  PROGRAMME_FAB_CLEARANCE,
  programmeStyles,
} from '../../src/features/programme/ProgrammeHeader';
import { ProgrammeScreen } from '../../src/features/programme/ProgrammeScreen';
import { controls } from '../../src/theme';

import { FORMATION_ID, activeProgramme, courseScreen, me, sidebar } from './fixtures';

const mockApi = {
  meGet: jest.fn(),
  sidebarGet: jest.fn(),
  formationsList: jest.fn(),
  programmeGet: jest.fn(),
  moduleCourse: jest.fn(),
  currentFormationUpdate: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));
jest.mock('../../src/lib/web', () => ({ openOnWeb: jest.fn(() => Promise.resolve('')) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.meGet.mockResolvedValue(me());
  mockApi.sidebarGet.mockResolvedValue(sidebar());
  mockApi.formationsList.mockResolvedValue({
    items: [{ id: FORMATION_ID, title: 'SAP S/4HANA Finance', status: 'active' }],
  });
  mockApi.programmeGet.mockResolvedValue(activeProgramme());
  mockApi.moduleCourse.mockResolvedValue(courseScreen());
});

describe('[SPEC-3202] FAB Android et disposition', () => {
  it('affiche le FAB citron sur Android et garde la place sous la liste (EF-1)', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <ProgrammeScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('programme-formation-card')).toBeTruthy();
    });
    expect(Platform.OS).toBe('android');
    expect(screen.getByTestId('programme-fab')).toBeTruthy();
    expect(screen.queryByTestId('programme-header-new')).toBeNull();
    const content = StyleSheet.flatten(programmeStyles.content);
    expect(content?.paddingBottom).toBe(PROGRAMME_FAB_CLEARANCE);
    expect(PROGRAMME_FAB_CLEARANCE).toBeGreaterThanOrEqual(PROGRAMME_FAB_BOTTOM + controls.fab);
  });
});
