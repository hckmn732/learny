// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { HeaderDto } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor, within } from '@learny/testing/render';

import { fr } from '../../messages/fr';

import { HeaderView, type HeaderViewProps } from './header';

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

const DATA: HeaderDto = {
  firstName: 'Alex',
  lastName: 'Perrin',
  emailLabel: 'a***@exemple.fr',
  activeFormationCount: 3,
  unreadNotificationCount: 3,
};

function view(overrides: Partial<HeaderViewProps> = {}) {
  return renderComponent(
    <HeaderView
      data={DATA}
      status="ready"
      pathname="/accueil"
      sidebarCollapsed
      onShowSidebar={vi.fn()}
      onRetry={vi.fn()}
      onNavigate={vi.fn()}
      onSignOut={vi.fn()}
      {...overrides}
    />,
  );
}

function order(elements: HTMLElement[]) {
  for (let index = 1; index < elements.length; index += 1) {
    const previous = elements[index - 1] as HTMLElement;
    const current = elements[index] as HTMLElement;
    expect(
      previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING,
      `${elements[index - 1]?.dataset.testid ?? ''} avant ${elements[index]?.dataset.testid ?? ''}`,
    ).toBeTruthy();
  }
}

describe('[SPEC-305] Coquille : en-tête figé et menu Mon compte', () => {
  it('rend les quatre actions dans l’ordre de la maquette avec leurs noms accessibles (CA-1, CA-4)', () => {
    view();
    const controls = [
      screen.getByTestId('sidebar-show'),
      screen.getByTestId('header-search-input'),
      screen.getByTestId('header-notifications'),
      screen.getByTestId('header-account-trigger'),
    ];
    order(controls);

    expect(screen.getByTestId('shell-header').className).toContain('sticky');
    expect(screen.getByTestId('shell-header').className).toContain('bg-header-glass');
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByTestId('header-search-input').getAttribute('aria-label')).toBe(
      fr.shell.header.searchLabel,
    );
    expect(screen.getByTestId('header-search-input').getAttribute('placeholder')).toBe(
      fr.shell.header.searchPlaceholder,
    );
    expect(screen.getByTestId('header-notifications').getAttribute('aria-label')).toBe(
      'Notifications, 3 non lues',
    );
    expect(screen.getByTestId('header-notifications-badge').textContent).toBe('3');
    expect(screen.getByTestId('header-account-trigger').getAttribute('aria-label')).toBe(
      'AP Mon compte',
    );
    expect(screen.getByTestId('sidebar-show').getAttribute('aria-label')).toBe(
      fr.shell.sidebar.show,
    );
  });

  it('affiche identité, nombre de formations actives et les trois actions (CA-2)', async () => {
    const onNavigate = vi.fn();
    const onSignOut = vi.fn();
    const { user } = view({ onNavigate, onSignOut });
    await user.click(screen.getByTestId('header-account-trigger'));
    const menu = await screen.findByTestId('account-menu');

    expect(within(menu).getByTestId('account-identity-name').textContent).toBe('Alex');
    expect(within(menu).getByText('AP')).toBeTruthy();
    expect(within(menu).getByTestId('account-active-formations').textContent).toBe(
      '3 formations en cours',
    );
    order([
      within(menu).getByTestId('account-settings'),
      within(menu).getByTestId('account-pause'),
      within(menu).getByTestId('account-sign-out'),
    ]);

    await user.click(within(menu).getByTestId('account-settings'));
    expect(onNavigate).toHaveBeenCalledWith('/parametres');

    await user.click(screen.getByTestId('header-account-trigger'));
    await user.click(await screen.findByTestId('account-pause'));
    expect(onNavigate).toHaveBeenCalledWith('/parametres#automatismes');

    await user.click(screen.getByTestId('header-account-trigger'));
    await user.click(await screen.findByTestId('account-sign-out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('parcourt le menu au clavier et rend le focus au déclencheur avec Échap (CA-2)', async () => {
    const { user } = view();
    const trigger = screen.getByTestId('header-account-trigger');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await screen.findByTestId('account-menu');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Paramètres');
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('account-menu')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('ferme le menu par clic extérieur et rend le focus au déclencheur (CA-2)', async () => {
    const { user } = view();
    const trigger = screen.getByTestId('header-account-trigger');
    await user.click(trigger);
    await screen.findByTestId('account-menu');

    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('account-menu')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('replie l’identité sur l’adresse abrégée quand le prénom manque (CL-1)', async () => {
    const { user } = view({
      data: {
        firstName: null,
        lastName: null,
        emailLabel: 'a***@exemple.fr',
        activeFormationCount: 0,
        unreadNotificationCount: 0,
      },
    });
    const trigger = screen.getByTestId('header-account-trigger');
    expect(trigger.textContent).not.toContain('@');
    expect(screen.queryByTestId('header-notifications-badge')).toBeNull();

    await user.click(trigger);
    const menu = await screen.findByTestId('account-menu');
    expect(within(menu).getByTestId('account-identity-name').textContent).toBe('a***@exemple.fr');
    expect(within(menu).getByTestId('account-active-formations').textContent).toBe(
      'Aucune formation en cours',
    );
    expect(within(menu).getByText('A')).toBeTruthy();
  });

  it('représente les états chargement et erreur avec réessai (ET-5, CL-2)', async () => {
    const onRetry = vi.fn();
    const loading = view({ data: null, status: 'loading' });
    await loading.user.click(screen.getByTestId('header-account-trigger'));
    let menu = await screen.findByTestId('account-menu');
    expect(within(menu).getByTestId('account-loading')).toBeTruthy();
    expect(within(menu).getByTestId('account-active-formations').textContent).toBe(
      'Chargement du compte…',
    );
    loading.unmount();

    const error = view({ data: null, status: 'error', onRetry });
    await error.user.click(screen.getByTestId('header-account-trigger'));
    menu = await screen.findByTestId('account-menu');
    expect(within(menu).getByRole('alert').textContent).toBe('Impossible de charger le compte.');
    await error.user.click(within(menu).getByTestId('account-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('account-menu')).toBeTruthy();
  });

  it('affiche l’erreur de déconnexion sans annoncer la session fermée (CL-2)', async () => {
    const { user } = view({ signOutPending: true, signOutError: fr.shell.header.signOutError });
    await user.click(screen.getByTestId('header-account-trigger'));
    const menu = await screen.findByTestId('account-menu');
    expect(within(menu).getByTestId('account-sign-out').textContent).toBe('Déconnexion…');
    expect(within(menu).getByTestId('account-sign-out-error').textContent).toBe(
      fr.shell.header.signOutError,
    );
    expect(within(menu).queryByText('Vous êtes déconnecté.')).toBeNull();
  });

  it('ferme le menu au changement de route et donne le focus au contenu (CL-3)', async () => {
    const { user, rerender } = view();
    rerender(
      <>
        <HeaderView
          data={DATA}
          status="ready"
          pathname="/accueil"
          sidebarCollapsed
          onShowSidebar={vi.fn()}
          onRetry={vi.fn()}
          onNavigate={vi.fn()}
          onSignOut={vi.fn()}
        />
        <div id="contenu" tabIndex={-1} data-testid="contenu" />
      </>,
    );
    await user.click(screen.getByTestId('header-account-trigger'));
    await screen.findByTestId('account-menu');

    rerender(
      <>
        <HeaderView
          data={DATA}
          status="ready"
          pathname="/agenda"
          sidebarCollapsed
          onShowSidebar={vi.fn()}
          onRetry={vi.fn()}
          onNavigate={vi.fn()}
          onSignOut={vi.fn()}
        />
        <div id="contenu" tabIndex={-1} data-testid="contenu" />
      </>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('account-menu')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('contenu'));
    });
  });

  it('garde les actions atteignables sous 900 px (CL-4)', () => {
    view({ sidebarCollapsed: false });
    expect(screen.getByTestId('sidebar-show').className).toContain('shell:hidden');
    expect(screen.getByTestId('header-notifications').getAttribute('aria-label')).toBe(
      'Notifications, 3 non lues',
    );
    expect(screen.getByTestId('header-account-trigger').getAttribute('aria-label')).toBe(
      'AP Mon compte',
    );
    expect(screen.getByTestId('header-search-input').getAttribute('aria-label')).toBe('Rechercher');
  });
});
