// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutomationActionItem } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import { TutorProposalBanner, slotLabel } from './TutorProposalBanner';

afterEach(cleanup);

const NOW = '2026-11-11T12:20:00.000Z';

function action(overrides: Partial<AutomationActionItem> = {}): AutomationActionItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'reprise',
    kind: 'reprise_proposed',
    summary:
      '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda.',
    formationId: '22222222-2222-4222-8222-222222222222',
    payload: {
      title: 'Ledgers parallèles',
      missedDate: '2026-11-10',
      proposed: {
        startsAt: '2026-11-12T10:30:00+01:00',
        endsAt: '2026-11-12T12:00:00+01:00',
        bufferSlotId: '33333333-3333-4333-8333-333333333333',
        inBuffer: true,
      },
      alternatives: [
        { startsAt: '2026-11-12T15:00:00+01:00', endsAt: '2026-11-12T16:00:00+01:00' },
        { startsAt: '2026-11-13T15:00:00+01:00', endsAt: '2026-11-13T16:00:00+01:00' },
        { startsAt: '2026-11-16T09:00:00+01:00', endsAt: '2026-11-16T10:00:00+01:00' },
      ],
    },
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: '2026-11-11T08:05:00.000Z',
    ...overrides,
  };
}

const noop = () => undefined;

function renderBanner(overrides: Partial<AutomationActionItem> = {}, extra = {}) {
  return renderComponent(
    <TutorProposalBanner
      action={action(overrides)}
      extraCount={0}
      now={NOW}
      timeZone="Europe/Paris"
      onAccept={noop}
      onDecline={noop}
      onUndo={noop}
      {...extra}
    />,
  );
}

describe('[SPEC-712] bandeau Le tuteur propose', () => {
  it('CA-5 — l’état par défaut affiche le sur-titre et les deux boutons de la maquette', () => {
    renderBanner();
    expect(screen.getByTestId('tutor-proposal-kicker').textContent).toBe(
      'Le tuteur propose · votre accord est demandé',
    );
    expect(screen.getByTestId('tutor-proposal-text').textContent).toContain('Ledgers parallèles');
    expect(screen.getByTestId('tutor-proposal-accept').textContent).toBe('Accepter');
    expect(screen.getByTestId('tutor-proposal-other').textContent).toBe('Autre créneau');
    expect(screen.queryByTestId('tutor-proposal-slots')).toBeNull();
  });

  it('CA-5 — « Autre créneau » déplie trois pastilles et « Ne pas replacer », focus déplacé', async () => {
    const { user } = renderBanner();
    await user.click(screen.getByTestId('tutor-proposal-other'));
    const group = screen.getByTestId('tutor-proposal-slots');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Créneaux libres proposés par le tuteur');
    expect(screen.getByTestId('tutor-proposal-slot-0').textContent).toBe('Jeudi 15:00');
    expect(screen.getByTestId('tutor-proposal-slot-1').textContent).toBe('Vendredi 15:00');
    expect(screen.getByTestId('tutor-proposal-slot-2').textContent).toBe('Lundi 16 nov., 9:00');
    expect(screen.getByTestId('tutor-proposal-decline').textContent).toBe('Ne pas replacer');
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('data-testid')).toBe('tutor-proposal-slot-0');
    });
  });

  it('ET-6 — Échap referme le groupe et rend le focus à « Autre créneau »', async () => {
    const { user } = renderBanner();
    const other = screen.getByTestId('tutor-proposal-other');
    await user.click(other);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tutor-proposal-slots')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('data-testid')).toBe('tutor-proposal-other');
    });
    expect(other.getAttribute('aria-expanded')).toBe('false');
  });

  it('CA-5 — choisir une pastille accorde le créneau choisi', async () => {
    const onAccept = vi.fn();
    const { user } = renderBanner({}, { onAccept });
    await user.click(screen.getByTestId('tutor-proposal-other'));
    await user.click(screen.getByTestId('tutor-proposal-slot-1'));
    expect(onAccept).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
      startsAt: '2026-11-13T15:00:00+01:00',
    });
  });

  it('CA-6 — après accord, « Séance replacée » et « Annuler » remplacent la proposition', async () => {
    const onUndo = vi.fn();
    const accepted = action({
      status: 'applied',
      summary:
        'C’est noté : reprise de « Ledgers parallèles » jeudi 10:30. Elle est dans votre agenda.',
    });
    const { user } = renderComponent(
      <TutorProposalBanner
        action={accepted}
        accepted={accepted}
        extraCount={0}
        now={NOW}
        timeZone="Europe/Paris"
        onAccept={noop}
        onDecline={noop}
        onUndo={onUndo}
      />,
    );
    expect(screen.getByTestId('tutor-proposal-kicker').textContent).toBe('Séance replacée');
    expect(screen.getByTestId('tutor-proposal-text').textContent).toContain('C’est noté');
    expect(screen.queryByTestId('tutor-proposal-accept')).toBeNull();
    await user.click(screen.getByTestId('tutor-proposal-undo'));
    expect(onUndo).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('EF-9 — un grand changement propose « Voir les options » et « Pas maintenant »', async () => {
    const onDecline = vi.fn();
    const { user } = renderBanner(
      {
        kind: 'plan_change_proposed',
        summary:
          '5 jours sans étude sur « SAP S/4HANA Finance » : je propose d’alléger le programme ou de décaler la fin.',
        payload: {
          formationTitle: 'SAP S/4HANA Finance',
          inactiveDays: 5,
          reason: 'inactivity',
          options: [
            { kind: 'shift_end', feasible: true },
            { kind: 'lighten', feasible: true },
          ],
        },
      },
      { onDecline },
    );
    expect(screen.getByTestId('tutor-proposal-options').textContent).toBe('Voir les options');
    expect(screen.getByTestId('tutor-proposal-later').textContent).toBe('Pas maintenant');
    await user.click(screen.getByTestId('tutor-proposal-options'));
    expect(screen.getByTestId('tutor-proposal-plan-shift_end').textContent).toBe('Décaler la fin');
    expect(screen.getByTestId('tutor-proposal-plan-lighten').textContent).toBe(
      'Alléger le programme',
    );
    await user.click(screen.getByTestId('tutor-proposal-later'));
    expect(onDecline).toHaveBeenCalled();
  });

  it('EF-9 — le nombre d’autres propositions ouvre le journal', () => {
    renderBanner({}, { extraCount: 2 });
    const more = screen.getByTestId('tutor-proposal-more');
    expect(more.textContent).toBe('2 autres propositions');
    expect(more.getAttribute('href')).toBe('/parametres#automatismes');
  });

  it('§10 — les libellés suivent la semaine courante', () => {
    expect(slotLabel('2026-11-12T15:00:00+01:00', NOW, 'Europe/Paris')).toBe('Jeudi 15:00');
    expect(slotLabel('2026-11-16T09:00:00+01:00', NOW, 'Europe/Paris')).toBe('Lundi 16 nov., 9:00');
  });
});
