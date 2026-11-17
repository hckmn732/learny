// @vitest-environment jsdom
// SPEC-802 CL-1, CL-2, EF-2 — connected sidebar: the mobile overlay never overwrites the stored
// collapse preference, and crossing 900 px closes the overlay without losing that preference.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SidebarDto } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

const sidebarUpdate = vi.fn();
const sidebarGet = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/accueil',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, ...rest }: Record<string, unknown>) => {
    const props = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'prefetch'));
    return createElement('a', {
      ...props,
      href: String(href),
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        (props.onClick as ((e: MouseEvent) => void) | undefined)?.(event);
      },
    });
  },
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...original,
    api: new Proxy(
      {},
      {
        get: (_target, name) => {
          if (name === 'sidebarUpdate') return sidebarUpdate;
          if (name === 'sidebarGet') return sidebarGet;
          return vi.fn();
        },
      },
    ),
  };
});

const { Sidebar, SIDEBAR_COLLAPSED_STORAGE_KEY } = await import('../../components/shell/sidebar');

/** Controllable `matchMedia`: every query is evaluated against the current width. */
let width = 390;
const listeners = new Set<() => void>();

function matches(query: string): boolean {
  const match = /width < ([\d.]+)rem/.exec(query);
  if (match === null) return false;
  return width < Number(match[1]) * 16;
}

function resize(next: number): void {
  width = next;
  act(() => {
    for (const listener of listeners) listener();
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return matches(query);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  width = 390;
  listeners.clear();
  sidebarUpdate.mockReset();
  sidebarGet.mockReset();
  window.localStorage.clear();
});

afterEach(cleanup);

function dto(collapsed: boolean): SidebarDto {
  return {
    collapsed,
    currentFormation: null,
    formations: [],
    quizDueCount: 0,
    gapCount: 0,
    streak: { days: 0, regularity: [] },
  };
}

function renderSidebar(collapsed: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sidebarGet.mockResolvedValue(dto(collapsed));
  return renderComponent(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Sidebar, { initialData: dto(collapsed) }),
    ),
  );
}

describe('[SPEC-802] menu latéral en surimpression', () => {
  it('ne remplace jamais la préférence mémorisée par l’état mobile (CL-2)', async () => {
    const { user } = renderSidebar(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('1');

    await user.click(screen.getByTestId('sidebar-show'));
    const sidebar = await screen.findByTestId('sidebar');
    expect(sidebar.getAttribute('role')).toBe('dialog');
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('sidebar-home'));
    });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar')).toBeNull();
    });

    // Back above 900 px: the stored « hidden » preference still applies.
    resize(1440);
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(sidebarUpdate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('1');
  });

  it('ferme la surimpression au passage à 900 px sans perdre la préférence (CL-1)', async () => {
    const { user } = renderSidebar(false);
    await user.click(screen.getByTestId('sidebar-show'));
    expect((await screen.findByTestId('sidebar')).getAttribute('role')).toBe('dialog');

    resize(900);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar').getAttribute('role')).toBeNull();
    });
    expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
    expect(sidebarUpdate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('0');
  });

  it('ferme la surimpression au clic sur un lien (EF-2)', async () => {
    const { user } = renderSidebar(false);
    await user.click(screen.getByTestId('sidebar-show'));
    await screen.findByTestId('sidebar-backdrop');
    await user.click(screen.getByTestId('sidebar-agenda'));
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
    });
  });
});
