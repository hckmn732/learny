// Jest + RNTL — écran Groupe (zone A du rattrapage mobile).
//
// Members, roles, invitation code and the privacy sentence come from `GroupDto`; the asserted
// action is joining another group by its code, the only write that leaves this formation.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GroupState } from '@learny/contracts';

import { GroupeScreen } from '../../../src/features/mr/programme/GroupeScreen';

const FORMATION = '9a1b2c3d-cccc-4d4d-8d8d-151515151515';
const OWNER = '0a1b2c3d-dddd-4e4e-9e9e-161616161616';

const STATE: GroupState = {
  formationId: FORMATION,
  formationTitle: 'Gestion de projet agile',
  formationStatus: 'active',
  canCreate: false,
  group: {
    id: '1b2c3d4e-eeee-4f4f-8f4f-171717171717',
    formationId: FORMATION,
    formationTitle: 'Gestion de projet agile',
    inviteCode: 'LRN-7K2Q',
    inviteLink: '/invitation/LRN-7K2Q',
    maxMembers: 10,
    memberCount: 3,
    ownerId: OWNER,
    viewerRole: 'owner',
    canManage: true,
    canLeave: false,
    members: [
      {
        userId: OWNER,
        firstName: 'Benito',
        role: 'owner',
        memberStatus: 'active',
        currentModulePosition: 3,
        validatedModules: 2,
        streakDays: 12,
      },
      {
        userId: '2c3d4e5f-ffff-4a4a-9a4a-181818181818',
        firstName: 'Camille',
        role: 'member',
        memberStatus: 'active',
        currentModulePosition: 3,
        validatedModules: 2,
        streakDays: 6,
      },
    ],
  },
};

const mockAccept = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      formationGroupGet: () => Promise.resolve(STATE),
      formationGroupCreate: () => Promise.resolve(STATE),
      invitationAccept: (input: unknown) => {
        mockAccept(input);
        return Promise.resolve({
          formationId: FORMATION,
          formationTitle: 'Gestion de projet agile',
          memberFirstNames: ['Benito', 'Camille'],
        });
      },
      groupRotateCode: () => Promise.resolve(STATE),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderGroupe(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GroupeScreen formationId={FORMATION} onBack={jest.fn()} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByText('LRN-7K2Q')).toBeTruthy();
  });
}

describe('écran Groupe', () => {
  beforeEach(() => {
    mockAccept.mockClear();
  });

  it('affiche les membres, leur rôle et la confidentialité', async () => {
    await renderGroupe();

    expect(screen.getByTestId('qf-groupe')).toBeTruthy();
    expect(screen.getByText('Benito')).toBeTruthy();
    expect(screen.getByText('Camille')).toBeTruthy();
    expect(screen.getByText('Module 3 · série de 12 j')).toBeTruthy();
    expect(screen.getByText('Propriétaire')).toBeTruthy();
    expect(
      screen.getByText('Même programme et même agenda. Vos apports et vos résultats restent privés.'),
    ).toBeTruthy();
  });

  it('rejoint une formation avec un code d’invitation (action principale)', async () => {
    await renderGroupe();

    await fireEvent.press(screen.getByTestId('qf-groupe-join-open'));
    await waitFor(() => {
      expect(screen.getByTestId('qf-groupe-join-code')).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByTestId('qf-groupe-join-code'), 'lrn-7k2q');
    await fireEvent.press(screen.getByTestId('qf-groupe-join-submit'));

    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith({ params: { code: 'LRN-7K2Q' } });
    });
  });
});