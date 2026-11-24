// Jest + RNTL [SPEC-3201] — actions du tuteur : rendu, optimisme et retour arrière (EF-5, CA-4).
//
// Two levels: the section itself (buttons, labels, accessibility) and the hook `useTutorActions`
// mounted with a real QueryClient, which proves the cache changes before the server answers and is
// restored when the mutation fails.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { AutomationActionItem } from '@learny/contracts';

import { useAutomationActions, useTutorActions } from '../../src/data/home';
import { TutorActionsSection } from '../../src/features/aujourdhui/TutorActionsSection';
import { expectAccessible } from '../utils/expectAccessible';

const mockApi = {
  meAutomationActionsList: jest.fn(),
  meAutomationActionAccept: jest.fn(),
  meAutomationActionDecline: jest.fn(),
  meAutomationActionUndo: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

function pendingItem(overrides: Partial<AutomationActionItem> = {}): AutomationActionItem {
  return {
    id: 'a-pending',
    automation: 'reprise',
    kind: 'reprise_proposed',
    summary: '« Ledgers parallèles » non terminé mardi : reprise proposée jeudi 10:30.',
    formationId: 'f-sap',
    payload: {
      alternatives: [{ startsAt: '2026-11-12T09:30:00.000Z', endsAt: '2026-11-12T10:10:00.000Z' }],
    },
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: '2026-11-11T07:05:00.000Z',
    ...overrides,
  };
}

function appliedItem(overrides: Partial<AutomationActionItem> = {}): AutomationActionItem {
  return {
    id: 'a-applied',
    automation: 'jeu_lacune',
    kind: 'game_chosen',
    summary: 'Lacune « Variante d’exercice » : carte de rappel ajoutée au quiz global.',
    formationId: 'f-sap',
    payload: {},
    undoPayload: { notionId: 'n-1' },
    requiresConsent: false,
    status: 'applied',
    decidedAt: '2026-11-11T07:01:00.000Z',
    createdAt: '2026-11-11T07:01:00.000Z',
    ...overrides,
  };
}

const NOOP = (): void => undefined;

describe('[SPEC-3201] section des actions du tuteur', () => {
  it('affiche les actions en attente et leurs boutons (EF-5)', async () => {
    const onAccept = jest.fn();
    const view = await render(
      <TutorActionsSection
        pending={[pendingItem()]}
        recent={[appliedItem()]}
        online
        busy={false}
        timeZone="Europe/Paris"
        onSeeAll={NOOP}
        onAccept={onAccept}
        onDecline={NOOP}
        onUndo={NOOP}
        onChooseSlot={NOOP}
      />,
    );
    expect(view.getByTestId('tutor-actions-title')).toHaveTextContent('Le tuteur a agi');
    expect(view.getByTestId('tutor-action-a-pending')).toBeTruthy();
    expect(view.getByText('Séance replacée')).toBeTruthy();
    expect(view.getByText('Carte créée')).toBeTruthy();
    await fireEvent.press(view.getByTestId('tutor-accept-0'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expectAccessible(view, 'tutor-accept-0', { role: 'button', label: 'Accepter' });
    expectAccessible(view, 'tutor-see-all', { role: 'link', label: 'Tout voir' });
  });

  it('déplie les créneaux proposés et choisit le premier (BR-AUT-01)', async () => {
    const onChooseSlot = jest.fn();
    const view = await render(
      <TutorActionsSection
        pending={[pendingItem()]}
        recent={[]}
        online
        busy={false}
        timeZone="Europe/Paris"
        onSeeAll={NOOP}
        onAccept={NOOP}
        onDecline={NOOP}
        onUndo={NOOP}
        onChooseSlot={onChooseSlot}
      />,
    );
    await fireEvent.press(view.getByTestId('tutor-other-slot-0'));
    await waitFor(() => {
      expect(view.getByTestId('tutor-slot-0-0')).toBeTruthy();
    });
    expect(view.getByText('jeu. 12 nov. 10:30')).toBeTruthy();
    await fireEvent.press(view.getByTestId('tutor-slot-0-0'));
    expect(onChooseSlot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a-pending' }),
      '2026-11-12T09:30:00.000Z',
    );
  });

  it('propose « Annuler » sur une action appliquée (BR-AUT-12)', async () => {
    const onUndo = jest.fn();
    const view = await render(
      <TutorActionsSection
        pending={[]}
        recent={[appliedItem()]}
        online
        busy={false}
        timeZone="Europe/Paris"
        onSeeAll={NOOP}
        onAccept={NOOP}
        onDecline={NOOP}
        onUndo={onUndo}
        onChooseSlot={NOOP}
      />,
    );
    expect(view.getByText('Fait')).toBeTruthy();
    await fireEvent.press(view.getByTestId('tutor-undo-0'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('désactive les mutations hors ligne (CL-5)', async () => {
    const onAccept = jest.fn();
    const view = await render(
      <TutorActionsSection
        pending={[pendingItem()]}
        recent={[]}
        online={false}
        busy={false}
        timeZone="Europe/Paris"
        onSeeAll={NOOP}
        onAccept={onAccept}
        onDecline={NOOP}
        onUndo={NOOP}
        onChooseSlot={NOOP}
      />,
    );
    await fireEvent.press(view.getByTestId('tutor-accept-0'));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('affiche l’état vide du journal (EF-5)', async () => {
    const view = await render(
      <TutorActionsSection
        pending={[]}
        recent={[]}
        online
        busy={false}
        timeZone="Europe/Paris"
        onSeeAll={NOOP}
        onAccept={NOOP}
        onDecline={NOOP}
        onUndo={NOOP}
        onChooseSlot={NOOP}
      />,
    );
    expect(view.getByTestId('tutor-actions-empty')).toBeTruthy();
  });
});

function Probe(): React.ReactElement {
  const actions = useAutomationActions();
  const tutor = useTutorActions();
  const status = actions.pending[0]?.status ?? actions.recent[0]?.status ?? 'none';
  return (
    <>
      <Text testID="probe-status">{status}</Text>
      <Pressable
        testID="probe-run"
        onPress={() => {
          void tutor.run({ id: 'a-pending', action: 'accept' }).catch(() => undefined);
        }}
      >
        <Text>accept</Text>
      </Pressable>
    </>
  );
}

async function renderProbe(): Promise<Awaited<ReturnType<typeof render>>> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(view.getByTestId('probe-status')).toHaveTextContent('pending_consent');
  });
  return view;
}

describe('[SPEC-3201] cache optimiste des actions du tuteur', () => {
  beforeEach(() => {
    mockApi.meAutomationActionsList.mockReset();
    mockApi.meAutomationActionAccept.mockReset();
  });

  it('applique le changement avant la réponse du serveur (EF-5, CA-4)', async () => {
    mockApi.meAutomationActionsList.mockResolvedValue({
      items: [pendingItem()],
      weekCount: 5,
      nextCursor: null,
    });
    let resolveAccept: ((item: AutomationActionItem) => void) | undefined;
    mockApi.meAutomationActionAccept.mockImplementation(
      () =>
        new Promise<AutomationActionItem>((resolve) => {
          resolveAccept = resolve;
        }),
    );

    const view = await renderProbe();
    await fireEvent.press(view.getByTestId('probe-run'));
    await waitFor(() => {
      expect(view.getByTestId('probe-status')).toHaveTextContent('applied');
    });
    resolveAccept?.(appliedItem({ id: 'a-pending' }));
    await waitFor(() => {
      expect(mockApi.meAutomationActionAccept).toHaveBeenCalledTimes(1);
    });
  });

  it('restaure l’état précédent quand la mutation échoue (EF-5, CA-4)', async () => {
    mockApi.meAutomationActionsList.mockResolvedValue({
      items: [pendingItem()],
      weekCount: 5,
      nextCursor: null,
    });
    mockApi.meAutomationActionAccept.mockRejectedValue(new Error('boom'));

    const view = await renderProbe();
    await fireEvent.press(view.getByTestId('probe-run'));
    await waitFor(() => {
      expect(view.getByTestId('probe-status')).toHaveTextContent('pending_consent');
    });
  });
});
