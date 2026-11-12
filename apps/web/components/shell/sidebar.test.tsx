// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SidebarDto, SidebarFormation } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor, within } from '@learny/testing/render';

import { SidebarView, type SidebarViewProps } from './sidebar';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverMock;
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

const SAP: SidebarFormation = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'SAP S/4HANA Finance',
  monogram: 'SA',
  accent: 'indigo',
  status: 'active',
  progressPercent: 33,
  currentModulePosition: 2,
  moduleCount: 3,
};

const AGILE: SidebarFormation = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Gestion de projet agile',
  monogram: 'GE',
  accent: 'green',
  status: 'paused',
  progressPercent: 50,
  currentModulePosition: 1,
  moduleCount: 2,
};

function data(overrides: Partial<SidebarDto> = {}): SidebarDto {
  return {
    collapsed: false,
    currentFormation: SAP,
    formations: [SAP, AGILE],
    quizDueCount: 14,
    gapCount: 4,
    streak: {
      days: 12,
      regularity: Array.from({ length: 14 }, (_value, index) => ({
        date: new Date(Date.UTC(2026, 9, 29 + index)).toISOString().slice(0, 10),
        status: index < 2 ? 'none' : 'done',
      })),
    },
    ...overrides,
  };
}

function view(overrides: Partial<SidebarViewProps> = {}) {
  return renderComponent(
    <SidebarView
      data={data()}
      status="ready"
      collapsed={false}
      overlayOpen={false}
      pathname="/accueil"
      onHide={vi.fn()}
      onShow={vi.fn()}
      onCloseOverlay={vi.fn()}
      onRetry={vi.fn()}
      onSelectFormation={vi.fn()}
      {...overrides}
    />,
  );
}

describe('[SPEC-304] Coquille : menu latéral', () => {
  it('rend les dix régions dans l’ordre de la maquette et la carte de formation (CA-1)', () => {
    view();
    const order = [
      'sidebar-logo',
      'sidebar-nav-main',
      'sidebar-separator',
      'sidebar-current-formation',
      'sidebar-switch-formation',
      'sidebar-formation-card',
      'sidebar-formation-nav',
      'sidebar-quiz-badge',
      'sidebar-gaps-badge',
      'sidebar-streak',
    ];
    const elements = order.map((testId) => {
      const element = screen.getByTestId(testId);
      expect(element, testId).toBeTruthy();
      return element;
    });
    for (let index = 1; index < elements.length; index += 1) {
      const previous = elements[index - 1] as HTMLElement;
      const current = elements[index] as HTMLElement;
      expect(
        previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${order[index - 1] ?? ''} avant ${order[index] ?? ''}`,
      ).toBeTruthy();
    }

    const card = screen.getByTestId('sidebar-formation-card');
    expect(within(card).getByText('SA')).toBeTruthy();
    expect(within(card).getByText('SAP S/4HANA Finance')).toBeTruthy();
    expect(card.textContent).toContain('33\u00a0%');
    expect(within(card).getByText('Module 2 sur 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quiz global/ }).getAttribute('href')).toBe(
      `/formations/${SAP.id}/quiz-global`,
    );
    expect(screen.getByTestId('sidebar-quiz-badge').textContent).toBe('14');
    expect(screen.getByTestId('sidebar-gaps-badge').textContent).toBe('4');
    expect(screen.getByTestId('sidebar-streak-count').textContent).toBe('12 jours');
    expect(screen.getAllByTestId('sidebar-streak-day')).toHaveLength(14);
    expect(screen.getAllByTestId('sidebar-streak-day')[0]?.getAttribute('data-status')).toBe(
      'none',
    );
  });

  it('marque uniquement le lien de la route courante avec aria-current (CA-4)', () => {
    view({ pathname: `/formations/${SAP.id}/programme` });
    expect(screen.getByTestId('sidebar-programme').getAttribute('aria-current')).toBe('page');
    for (const testId of [
      'sidebar-home',
      'sidebar-agenda',
      'sidebar-notion-map',
      'sidebar-global-quiz',
      'sidebar-gaps',
    ]) {
      expect(screen.getByTestId(testId).getAttribute('aria-current'), testId).toBeNull();
    }
  });

  it('affiche l’état vide avec Créer une formation et aucun lien de formation (EF-5, CL-1)', () => {
    view({ data: data({ currentFormation: null, formations: [] }) });
    expect(screen.getByTestId('sidebar-empty')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Créer une formation' }).getAttribute('href')).toBe(
      '/formations/nouvelle',
    );
    expect(screen.queryByTestId('sidebar-formation-nav')).toBeNull();
    expect(screen.queryByTestId('sidebar-switch-formation')).toBeNull();
    expect(screen.queryByTestId('sidebar-formation-card')).toBeNull();
  });

  it('représente les états chargement et erreur avec réessai (ET-5)', async () => {
    const onRetry = vi.fn();
    const { unmount } = view({ data: null, status: 'loading' });
    expect(screen.getByTestId('sidebar-loading')).toBeTruthy();
    expect(screen.queryByTestId('sidebar-formation-card')).toBeNull();
    unmount();

    const { user } = view({ data: null, status: 'error', onRetry });
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.click(screen.getByTestId('sidebar-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('masque et réaffiche le menu par les contrôles nommés (EF-3)', async () => {
    const onHide = vi.fn();
    const { user, unmount } = view({ onHide });
    await user.click(screen.getByTestId('sidebar-hide'));
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sidebar-hide').getAttribute('aria-label')).toBe('Masquer le menu');
    unmount();

    const onShow = vi.fn();
    const collapsed = view({ collapsed: true, onShow });
    expect(screen.queryByTestId('sidebar')).toBeNull();
    await collapsed.user.click(screen.getByTestId('sidebar-show'));
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sidebar-show').getAttribute('aria-label')).toBe('Afficher le menu');
  });

  it('liste les formations actives et en pause et transmet le choix (EF-2)', async () => {
    const onSelectFormation = vi.fn();
    const { user } = view({ onSelectFormation });
    await user.click(screen.getByTestId('sidebar-switch-formation'));
    const menu = await screen.findByTestId('sidebar-formation-menu');
    expect(within(menu).getByText('Gestion de projet agile')).toBeTruthy();
    expect(within(menu).getByText('En pause')).toBeTruthy();
    await user.click(screen.getByTestId(`sidebar-formation-option-${AGILE.id}`));
    await waitFor(() => {
      expect(onSelectFormation).toHaveBeenCalledWith(AGILE);
    });
  });

  it('ouvre la surimpression mobile avec voile, dialogue modal et fermeture par le voile (CL-3)', async () => {
    const onCloseOverlay = vi.fn();
    const { user } = view({ overlayOpen: true, onCloseOverlay });
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.getAttribute('role')).toBe('dialog');
    expect(sidebar.getAttribute('aria-modal')).toBe('true');
    expect(sidebar.className).toContain('fixed');
    const backdrop = screen.getByTestId('sidebar-backdrop');
    await user.click(backdrop);
    expect(onCloseOverlay).toHaveBeenCalledTimes(1);
  });
});
