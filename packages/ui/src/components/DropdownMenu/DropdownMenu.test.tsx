// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

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

function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button data-testid="menu-trigger" type="button">
          Mon compte
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="menu-content">
        <DropdownMenuLabel>Apprenant</DropdownMenuLabel>
        <DropdownMenuItem>Paramètres</DropdownMenuItem>
        <DropdownMenuItem>Mettre en pause</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('[SPEC-303] DropdownMenu', () => {
  it('parcourt les éléments au clavier et rend le focus au déclencheur (CL-1, CA-2)', async () => {
    const { user } = renderComponent(<AccountMenu />);
    const trigger = screen.getByTestId('menu-trigger');

    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Paramètres');
    });

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Mettre en pause');
    });
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Se déconnecter');
    });
    await user.keyboard('{Home}');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Paramètres');
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
    expect(menu.className).toContain('w-[260px]');
    expect(menu.className).toContain('rounded-18');
    expect(menu.className).toContain('shadow-menu');
  });

  it('s’ouvre avec la flèche bas et se ferme avec Tab (CL-1)', async () => {
    const { user } = renderComponent(<AccountMenu />);
    const trigger = screen.getByTestId('menu-trigger');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('menu');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Paramètres');
    });
    await user.keyboard('{Tab}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });
});
