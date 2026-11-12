// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ErrorView } from './error-view';
import { GlobalErrorView } from './global-error-view';
import { AccessDeniedView, NotFoundView, OfflineView, SystemLoadingView } from './system-page-view';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('[SPEC-308] Pages système', () => {
  it('404 : un h1, une action et un lien d’accueil, sans identifiant factice (CA-1, CL-2)', () => {
    renderComponent(<NotFoundView signedIn={false} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page introuvable');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toBeTruthy();
    expect(screen.queryByText(/identifiant de requête/i)).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/stack|table|\.tsx|secret/i);
  });

  it('404 et accès refusé changent l’action principale selon la session (EF-1, ET-2)', () => {
    const anonymous = renderToStaticMarkup(<NotFoundView signedIn={false} />);
    expect(anonymous).toContain('Se connecter');
    expect(anonymous).toContain('Retour à l’accueil');

    cleanup();
    const signedIn = renderToStaticMarkup(<NotFoundView signedIn />);
    expect(signedIn).toContain('Retour à l’accueil');

    cleanup();
    renderComponent(<AccessDeniedView signedIn />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Accès refusé');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull();
  });

  it('hors-ligne : le texte et les liens restent utilisables sans JavaScript (CL-1)', () => {
    renderComponent(<OfflineView />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vous êtes hors ligne');
    expect(screen.getByRole('link', { name: 'Réessayer' }).getAttribute('href')).toBe(
      '/hors-ligne',
    );
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('/');
  });

  it('chargement : un h1, un statut annoncé et une action de sortie (CA-1)', () => {
    renderComponent(<SystemLoadingView />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Chargement en cours');
    expect(screen.getByRole('status').textContent).toBe('Chargement…');
    expect(screen.getByTestId('system-loading').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('/');
  });

  it('erreur récupérable : reset() une seule fois, identifiant présent affiché, absent inventé (CA-2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reset = vi.fn();
    const { user } = renderComponent(
      <ErrorView
        error={
          new AppError('INTERNAL_ERROR', 'SQLSTATE 42P01 relation "app.secret" inexistante', {
            requestId: 'req-spec-308',
          })
        }
        reset={reset}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Une erreur est survenue');
    expect(screen.getByTestId('system-error-request-id').textContent).toBe(
      'Identifiant de requête : req-spec-308',
    );
    expect(document.body.innerHTML).not.toContain('SQLSTATE');
    expect(document.body.innerHTML).not.toContain('app.secret');
    expect(document.body.innerHTML).not.toMatch(/\.tsx:\d+|stack/i);

    await user.click(screen.getByTestId('system-error-retry'));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('/');

    cleanup();
    renderComponent(<ErrorView error={new TypeError('boom at secret.ts:12')} reset={reset} />);
    expect(screen.queryByTestId('system-error-request-id')).toBeNull();
    expect(document.body.innerHTML).not.toContain('secret.ts');
  });

  it('erreur racine : html et body propres, h1 et action de reprise (CL-4)', () => {
    const html = renderToStaticMarkup(
      <GlobalErrorView error={new Error('root boom')} reset={() => undefined} />,
    );
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<body');
    expect(html).toContain('Une erreur est survenue');
    expect(html).toContain('Réessayer');
    expect(html).not.toContain('root boom');
  });
});
