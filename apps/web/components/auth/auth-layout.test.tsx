// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { SITE_FOOTER_NAV_LABEL } from '../../lib/site-footer-links';

import { authStepForPath, AuthLayout } from './auth-layout';

afterEach(cleanup);

describe("[SPEC-308] Pages système et mise en page d'authentification", () => {
  it('dérive le compteur et l’étape courante du chemin (inscription, vérification, connexion)', () => {
    expect(authStepForPath('/inscription')).toEqual({
      current: 0,
      label: 'Étape 1 sur 7 · Compte',
    });
    expect(authStepForPath('/verifier-email')).toEqual({
      current: 1,
      label: 'Étape 2 sur 7 · Vérification',
    });
    expect(authStepForPath('/connexion')).toEqual({ current: 0, label: 'Connexion' });
    expect(authStepForPath('/premiers-pas/ia')).toEqual({
      current: 4,
      label: 'Étape 5 sur 7 · IA',
    });
    expect(authStepForPath('/premiers-pas/inconnu')).toEqual({
      current: 0,
      label: 'Étape 1 sur 7 · Compte',
    });
  });

  it('compose le panneau sombre à gauche et la carte claire à droite sur desktop (EF-3)', () => {
    renderComponent(
      <AuthLayout step={authStepForPath('/inscription')}>
        <div data-testid="auth-child">Formulaire</div>
      </AuthLayout>,
    );

    const layout = screen.getByTestId('auth-layout');
    // SPEC-806 mounts the legal footer under the split panel: the root is a column, and the
    // panel/card row is what keeps `flex-wrap` so it stacks under 900 px.
    expect(layout.className).toContain('flex-col');
    expect(layout.firstElementChild?.className ?? '').toContain('flex-wrap');
    expect(layout.className).toContain('min-h-dvh');
    expect(layout.className).toContain('bg-canvas');

    const panel = screen.getByTestId('auth-panel');
    expect(panel.getAttribute('aria-label')).toBe('Learny');
    expect(panel.className).toContain('bg-ink');
    expect(panel.className).toContain('flex-[1_1_23.75rem]');
    expect(panel.className).toContain('text-white');

    const main = screen.getByTestId('auth-main');
    expect(main.className).toContain('flex-[999_1_35rem]');
    expect(main.className).toContain('min-w-0');
    expect(screen.getByTestId('auth-content').className).toContain('max-w-[35rem]');
    expect(screen.getByTestId('auth-child')).toBeTruthy();

    // DOM order: the Learny panel opens the split row, before the form column.
    expect(layout.firstElementChild?.firstElementChild).toBe(panel);
    expect(panel.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // SPEC-806: the only navigation is the named legal footer; no menu of the connected shell.
    expect(screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label'))).toEqual([
      SITE_FOOTER_NAV_LABEL,
    ]);
  });

  it('affiche les textes, les sept étapes et l’état accessible de la maquette (EF-4, CA-3)', () => {
    renderComponent(
      <AuthLayout step={authStepForPath('/verifier-email')}>
        <p>Vérification</p>
      </AuthLayout>,
    );

    expect(screen.getByTestId('auth-panel').textContent).toContain('Apprenez vite.');
    expect(screen.getByTestId('auth-panel').textContent).toContain('Retenez longtemps.');
    expect(
      screen.getByText(
        'Un tuteur IA conçoit votre parcours, transforme vos ressources en cours, vous entraîne et vous fait réviser au bon moment.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Des cours construits à partir de vos propres ressources, sources citées'),
    ).toBeTruthy();
    expect(screen.getByText('Des révisions espacées pour ne pas oublier')).toBeTruthy();
    expect(screen.getByText('Gratuit avec votre propre clé d’IA')).toBeTruthy();

    expect(screen.getByTestId('auth-step-counter').textContent).toBe(
      'Étape 2 sur 7 · Vérification',
    );
    const steps = screen.getByRole('list', { name: 'Étapes de l’inscription' });
    expect(steps.querySelectorAll('li')).toHaveLength(7);

    const first = screen.getByTestId('auth-step-1');
    const current = screen.getByTestId('auth-step-2');
    const upcoming = screen.getByTestId('auth-step-3');
    expect(first.className).toContain('bg-lime');
    expect(first.getAttribute('aria-current')).toBeNull();
    expect(first.textContent).toBe('Étape 1 : Compte, faite');
    expect(current.className).toContain('bg-white');
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(current.textContent).toBe('Étape 2 : Vérification, en cours');
    expect(upcoming.className).toContain('bg-dark-600');
    expect(upcoming.getAttribute('aria-current')).toBeNull();
    expect(upcoming.textContent).toBe('Étape 3 : Profil');

    // Decorative marks are hidden from assistive technologies; the list carries the names.
    for (const icon of screen.getByTestId('auth-panel').querySelectorAll('svg')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('empile le panneau et le contenu sous 900 px sans menu connecté (CA-3)', () => {
    const { container } = renderComponent(
      <AuthLayout step={authStepForPath('/connexion')}>
        <p>Connexion</p>
      </AuthLayout>,
    );

    // The same flex-wrap basis is what the browser wraps at the 390 px viewport (e2e checks
    // the real geometry and the absence of horizontal overflow).
    const layout = screen.getByTestId('auth-layout');
    // SPEC-806 mounts the legal footer under the split panel: the root is a column, and the
    // panel/card row is what keeps `flex-wrap` so it stacks under 900 px.
    expect(layout.className).toContain('flex-col');
    expect(layout.firstElementChild?.className ?? '').toContain('flex-wrap');
    expect(screen.getByTestId('auth-panel').className).toContain('p-40');
    expect(screen.getByTestId('auth-step-counter').textContent).toBe('Connexion');
    expect(screen.getByTestId('auth-step-1').className).toContain('bg-white');
    expect(screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label'))).toEqual([
      SITE_FOOTER_NAV_LABEL,
    ]);
    expect(container.querySelector('[data-testid="app-sidebar"]')).toBeNull();
  });
});
