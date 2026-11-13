// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import { GapFilters } from './GapFilters';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/formations/f/lacunes',
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const COUNTS = {
  confusion: 1,
  misunderstanding: 1,
  application: 1,
  forgetting: 1,
} as const;

describe('[SPEC-615] filtres par nature', () => {
  it('affiche le compteur Tous et un compteur par nature (EF-1, EF-2)', () => {
    renderComponent(<GapFilters countsByNature={COUNTS} activeNature={null} />);

    expect(screen.getByTestId('gaps-filter-count-all').textContent).toBe('4');
    expect(screen.getByTestId('gaps-filter-count-confusion').textContent).toBe('1');
    expect(screen.getByTestId('gaps-filter-count-misunderstanding').textContent).toBe('1');
    expect(screen.getByTestId('gaps-filter-count-application').textContent).toBe('1');
    expect(screen.getByTestId('gaps-filter-count-forgetting').textContent).toBe('1');
    expect(
      screen.getByRole('button', { name: 'Toutes, 4 lacunes' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('pousse ?nature=confusion et marque le filtre actif (EF-2, CL-4)', async () => {
    const { user } = renderComponent(<GapFilters countsByNature={COUNTS} activeNature={null} />);

    await user.click(screen.getByRole('button', { name: 'Confusion, 1 lacune' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/formations/f/lacunes?nature=confusion', {
        scroll: false,
      });
    });
  });

  it('sélectionne au clavier et expose l’état sans dépendre de la couleur (EF-2)', async () => {
    const { user } = renderComponent(
      <GapFilters countsByNature={COUNTS} activeNature="confusion" />,
    );

    const all = screen.getByRole('button', { name: 'Toutes, 4 lacunes' });
    const confusion = screen.getByRole('button', { name: 'Confusion, 1 lacune' });
    expect(confusion.getAttribute('aria-pressed')).toBe('true');
    expect(all.getAttribute('aria-pressed')).toBe('false');

    all.focus();
    expect(document.activeElement).toBe(all);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/formations/f/lacunes', { scroll: false });
    });
  });
});
