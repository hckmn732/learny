// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '@learny/api-client';
import type { AutomationActionItem } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/home';
import { cleanup, renderComponent, screen, waitFor, within } from '@learny/testing/render';
import { ToastProvider, clearToasts } from '@learny/ui';

import { TutorActivityPanel } from './TutorActivityCard';

afterEach(() => {
  cleanup();
  clearToasts();
  vi.restoreAllMocks();
});

const FORMATION = '22222222-2222-4222-8222-222222222222';
const UNDOABLE = '11111111-1111-4111-8111-111111111111';
const NO_PAYLOAD = '33333333-3333-4333-8333-333333333333';

function action(overrides: Partial<AutomationActionItem> = {}): AutomationActionItem {
  return {
    id: UNDOABLE,
    automation: 'remediation',
    kind: 'remediation_ready',
    summary: 'Marge de remédiation réservée mercredi de 15:00 à 16:00.',
    formationId: FORMATION,
    payload: {},
    undoPayload: { slotId: '44444444-4444-4444-8444-444444444444' },
    requiresConsent: false,
    status: 'applied',
    decidedAt: '2026-11-11T08:05:00.000Z',
    createdAt: '2026-11-11T08:05:00.000Z',
    ...overrides,
  };
}

function mockJournal(applied: AutomationActionItem[]) {
  vi.spyOn(api, 'meAutomationActionsList').mockImplementation((input) =>
    Promise.resolve({
      items: input.query?.status === 'applied' ? applied : [],
      weekCount: applied.length,
      nextCursor: null,
    }),
  );
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderComponent(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TutorActivityPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('[SPEC-722] carte Le tuteur a agi pour vous', () => {
  it('QA SCR-03 — « Annuler » n’apparaît que pour une action annulable', async () => {
    mockJournal([
      action(),
      action({
        id: NO_PAYLOAD,
        summary: 'Cinq jeux choisis pour le quiz global.',
        createdAt: '2026-11-11T07:05:00.000Z',
        undoPayload: null,
      }),
    ]);
    renderPanel();

    const lines = await screen.findAllByTestId('automation-action');
    expect(lines).toHaveLength(2);
    const [undoable, withoutPayload] = lines;
    if (undoable === undefined || withoutPayload === undefined) throw new Error('deux lignes');
    expect(within(undoable).getByTestId('automation-action-undo').textContent).toBe(
      fr.home.tutorActed.undo,
    );
    expect(within(withoutPayload).queryByTestId('automation-action-undo')).toBeNull();
  });

  it('QA SCR-03 — un refus de l’annulation affiche une erreur visible', async () => {
    mockJournal([action()]);
    vi.spyOn(api, 'meAutomationActionUndo').mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'Cette action ne porte pas de charge d’annulation.', {
        status: 400,
      }),
    );
    const { user } = renderPanel();

    await user.click(await screen.findByTestId('automation-action-undo'));

    await waitFor(() => {
      expect(screen.getByTestId('ui-toast-error').textContent).toContain(
        fr.home.tutorActed.toastError,
      );
    });
    expect(screen.getByTestId('automation-action-undo').hasAttribute('disabled')).toBe(false);
  });

  it('QA SCR-03 — la pastille d’état mesure 8 unités, comme les pastilles du design system', async () => {
    mockJournal([action()]);
    renderPanel();

    const dot = await screen.findByTestId('automation-action-dot');
    expect(dot.className).toContain('size-8');
    expect(dot.className).toContain('mt-6');
    expect(dot.className).not.toMatch(/\bsize-2\b/);
  });
});
