// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import { AccountForm } from './AccountForm';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiMock = vi.hoisted(() => ({
  authMagicLink: vi.fn(),
  authSignUp: vi.fn(),
  authSignIn: vi.fn(),
  authResend: vi.fn(),
}));
vi.mock('../../lib/api-client', () => ({ api: apiMock }));

const EMAIL = 'alex.perrin@exemple.fr';
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  for (const fn of Object.values(apiMock)) fn.mockReset();
  apiMock.authMagicLink.mockResolvedValue(undefined);
  apiMock.authSignUp.mockResolvedValue({ status: 'confirmation_sent' });
  apiMock.authSignIn.mockResolvedValue({ destination: '/accueil' });
  apiMock.authResend.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('[SPEC-601] AccountForm', () => {
  it('affiche les textes, les deux méthodes et le bon libellé selon le mode (EF-3, EF-4)', async () => {
    const { user } = renderComponent(<AccountForm mode="signup" />);
    expect(screen.getByRole('heading', { name: 'Créer votre compte' })).toBeTruthy();
    expect(screen.getByText('Deux minutes pour démarrer, sans carte bancaire.')).toBeTruthy();
    expect(screen.getByTestId('auth-method-magic').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('auth-method-password').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('auth-submit').textContent).toBe('Recevoir mon lien');
    expect(screen.getByTestId('auth-terms')).toHaveProperty('checked', false);

    await user.click(screen.getByTestId('auth-method-password'));
    expect(screen.getByTestId('auth-submit').textContent).toBe('Créer mon compte');
    expect(screen.getByTestId('auth-password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByTestId('auth-strength')).toBeTruthy();
    expect(screen.getByTestId('auth-strength-hint').textContent).toBe(
      '12 caractères au moins ; une phrase facile à retenir fonctionne bien.',
    );
  });

  it('affiche les libellés de connexion sans conditions ni solidité (EF-4)', async () => {
    const { user } = renderComponent(<AccountForm mode="login" />);
    expect(screen.getByRole('heading', { name: 'Bon retour' })).toBeTruthy();
    expect(screen.queryByTestId('auth-terms')).toBeNull();
    expect(screen.getByTestId('auth-submit').textContent).toBe('Recevoir mon lien de connexion');

    await user.click(screen.getByTestId('auth-method-password'));
    expect(screen.getByTestId('auth-submit').textContent).toBe('Se connecter');
    expect(screen.getByTestId('auth-password').getAttribute('autocomplete')).toBe(
      'current-password',
    );
    expect(screen.queryByTestId('auth-strength')).toBeNull();
  });

  it('suit l’ordre des erreurs de EF-6 et ne soumet rien (CA-4)', async () => {
    const { user } = renderComponent(<AccountForm mode="signup" />);
    const submit = (): Promise<void> => user.click(screen.getByTestId('auth-submit'));

    await submit();
    expect(screen.getByTestId('auth-error').textContent).toBe(
      'Saisissez une adresse e-mail valide.',
    );

    await user.click(screen.getByTestId('auth-method-password'));
    await user.type(screen.getByTestId('auth-email'), EMAIL);
    await user.type(screen.getByTestId('auth-password'), 'court');
    await submit();
    expect(screen.getByTestId('auth-error').textContent).toBe(
      'Le mot de passe doit faire 12 caractères au moins.',
    );

    await user.clear(screen.getByTestId('auth-password'));
    await user.type(screen.getByTestId('auth-password'), 'motdepasse12');
    await submit();
    expect(screen.getByTestId('auth-error').textContent).toBe(
      'Acceptez les conditions pour créer votre compte.',
    );
    expect(apiMock.authSignUp).not.toHaveBeenCalled();
    expect(apiMock.authMagicLink).not.toHaveBeenCalled();
  });

  it('efface l’erreur à la frappe et au changement de méthode (EF-6)', async () => {
    const { user } = renderComponent(<AccountForm mode="signup" />);
    await user.click(screen.getByTestId('auth-submit'));
    expect(screen.getByTestId('auth-error')).toBeTruthy();

    await user.type(screen.getByTestId('auth-email'), 'a');
    expect(screen.queryByTestId('auth-error')).toBeNull();

    await user.click(screen.getByTestId('auth-submit'));
    await user.click(screen.getByTestId('auth-method-password'));
    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  it('désactive le bouton pendant l’envoi et n’envoie qu’une requête (CL-1, EF-7)', async () => {
    const pending = deferred<undefined>();
    apiMock.authMagicLink.mockReturnValue(pending.promise);
    const { user } = renderComponent(<AccountForm mode="signup" />);
    await user.type(screen.getByTestId('auth-email'), `  ${EMAIL} `);
    await user.click(screen.getByTestId('auth-terms'));
    await user.click(screen.getByTestId('auth-submit'));

    const button = screen.getByTestId('auth-submit');
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(apiMock.authMagicLink).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/verifier-email');
    });
    const stored = window.sessionStorage.getItem('learny.pendingAuth');
    expect(stored).toContain(`"email":"${EMAIL}"`);
    expect(stored).toContain('"method":"magic"');
    expect(stored).toContain('"intent":"signup"');
  });

  it('transmet la méthode et la zone au service (EF-7)', async () => {
    const { user } = renderComponent(<AccountForm mode="signup" />);
    await user.click(screen.getByTestId('auth-method-password'));
    await user.type(screen.getByTestId('auth-email'), EMAIL);
    await user.type(screen.getByTestId('auth-password'), 'motdepasse12');
    await user.click(screen.getByTestId('auth-terms'));
    await user.click(screen.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(apiMock.authSignUp).toHaveBeenCalledWith({
        body: {
          email: EMAIL,
          password: 'motdepasse12',
          acceptedTerms: true,
          timezone: TIMEZONE,
        },
      });
    });
    expect(router.push).toHaveBeenCalledWith('/verifier-email');
  });

  it('renvoie vers la vérification après un compte non confirmé (EF-12)', async () => {
    apiMock.authSignIn.mockRejectedValue(
      new AppError('EMAIL_NOT_CONFIRMED', 'Confirmez votre adresse e-mail pour continuer.'),
    );
    const { user } = renderComponent(<AccountForm mode="login" />);
    await user.click(screen.getByTestId('auth-method-password'));
    await user.type(screen.getByTestId('auth-email'), EMAIL);
    await user.type(screen.getByTestId('auth-password'), 'motdepasse12');
    await user.click(screen.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(apiMock.authResend).toHaveBeenCalledWith({
        body: { email: EMAIL, kind: 'signup' },
      });
      expect(router.push).toHaveBeenCalledWith('/verifier-email');
    });
    expect(window.sessionStorage.getItem('learny.pendingAuth')).toContain(
      '"notice":"confirmation_resent"',
    );
  });

  it('affiche le message neutre des identifiants faux (EF-12)', async () => {
    apiMock.authSignIn.mockRejectedValue(
      new AppError('INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.'),
    );
    const { user } = renderComponent(<AccountForm mode="login" />);
    await user.click(screen.getByTestId('auth-method-password'));
    await user.type(screen.getByTestId('auth-email'), EMAIL);
    await user.type(screen.getByTestId('auth-password'), 'motdepasse12');
    await user.click(screen.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-error').textContent).toBe(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('affiche l’erreur de lien expiré passée par la page (EF-11)', () => {
    renderComponent(
      <AccountForm
        initialError="Ce lien a expiré ou a déjà servi. Demandez-en un nouveau."
        mode="login"
      />,
    );
    expect(screen.getByTestId('auth-error').textContent).toBe(
      'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    );
  });
});
