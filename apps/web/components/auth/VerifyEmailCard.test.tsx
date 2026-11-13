// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, createClockFromEnv, setClock, systemClock } from '@learny/core';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { VerifyEmailCard } from './VerifyEmailCard';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiMock = vi.hoisted(() => ({
  meGet: vi.fn(),
  authResend: vi.fn(),
}));
vi.mock('../../lib/api-client', () => ({ api: apiMock }));

const NOW = '2026-11-11T12:20:00.000Z';

function pending(method: 'magic' | 'password', intent: 'signup' | 'login' = 'signup') {
  window.sessionStorage.setItem(
    'learny.pendingAuth',
    JSON.stringify({
      email: 'alex.perrin@exemple.fr',
      method,
      intent,
      sentAt: NOW,
    }),
  );
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  apiMock.meGet.mockReset();
  apiMock.authResend.mockReset();
  apiMock.meGet.mockResolvedValue({ onboardingStep: 'profil' });
  apiMock.authResend.mockResolvedValue(undefined);
  window.sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  // The Vitest environment freezes the shared clock: this file needs it to follow the browser.
  setClock(systemClock);
});

afterEach(() => {
  cleanup();
  setClock(createClockFromEnv({ CLOCK_FIXED_AT: NOW }));
  vi.useRealTimers();
});

describe('[SPEC-601] VerifyEmailCard', () => {
  it('reprend le compte à rebours de 60 s à 0 depuis sentAt (EF-9, CL-2)', () => {
    pending('magic');
    renderComponent(<VerifyEmailCard />);
    const resend = screen.getByTestId('verify-resend');
    expect(resend.textContent).toBe('renvoyez le lien (dans 60 s)');
    expect(resend).toHaveProperty('disabled', true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(resend.textContent).toBe('renvoyez le lien (dans 59 s)');

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(resend.textContent).toBe('renvoyez le lien');
    expect(resend).toHaveProperty('disabled', false);
  });

  it('affiche le texte du lien de connexion ou de confirmation (EF-8)', () => {
    pending('magic');
    const first = renderComponent(<VerifyEmailCard />);
    expect(screen.getByText(/Nous avons envoyé un lien de connexion à/)).toBeTruthy();
    expect(screen.getByText(/alex\.perrin@exemple\.fr/)).toBeTruthy();
    first.unmount();
    cleanup();

    pending('password');
    renderComponent(<VerifyEmailCard />);
    expect(screen.getByText(/Nous avons envoyé un lien de confirmation à/)).toBeTruthy();
  });

  it('affiche « votre adresse » quand aucune adresse n’est connue (EF-8)', () => {
    renderComponent(<VerifyEmailCard />);
    expect(screen.getByText(/à votre adresse/)).toBeTruthy();
    expect(screen.getByTestId('verify-resend')).toHaveProperty('disabled', true);
  });

  it('affiche le statut après un renvoi réussi (EF-8)', async () => {
    pending('magic');
    renderComponent(<VerifyEmailCard />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('verify-resend'));
      await Promise.resolve();
    });

    expect(apiMock.authResend).toHaveBeenCalledWith({
      body: { email: 'alex.perrin@exemple.fr', kind: 'magic_link' },
    });
    expect(screen.getByTestId('verify-status').textContent).toBe(
      'Nouveau lien envoyé. Il reste valable 1 heure.',
    );
    expect(screen.getByTestId('verify-resend').textContent).toBe('renvoyez le lien (dans 60 s)');
  });

  it('affiche le délai d’un 429 serveur (EF-9)', async () => {
    pending('password');
    apiMock.authResend.mockRejectedValue(
      new AppError('RESEND_TOO_SOON', 'Vous pourrez renvoyer le lien dans 30 secondes.', {
        status: 429,
        retryAfterSec: 30,
      }),
    );
    renderComponent(<VerifyEmailCard />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('verify-resend'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('auth-error').textContent).toBe(
      'Patientez encore 30 s avant un nouvel envoi.',
    );
    expect(screen.getByTestId('verify-resend').textContent).toBe('renvoyez le lien (dans 30 s)');
  });

  it('explique qu’un lien non ouvert sur ce navigateur ne donne pas de session (EF-10)', async () => {
    pending('magic');
    apiMock.meGet.mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'Vous devez être connecté.', { status: 401 }),
    );
    renderComponent(<VerifyEmailCard />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('verify-confirm'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('verify-status').textContent).toBe(
      'Le lien n’a pas encore été ouvert sur ce navigateur. Ouvrez-le depuis l’e-mail reçu.',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('navigue vers l’étape d’onboarding quand la session existe (EF-10)', async () => {
    pending('magic');
    apiMock.meGet.mockResolvedValue({ onboardingStep: 'rythme' });
    renderComponent(<VerifyEmailCard />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('verify-confirm'));
      await Promise.resolve();
    });

    expect(router.push).toHaveBeenCalledWith('/premiers-pas/rythme');
  });

  it('affiche le statut de renvoi automatique après un compte non confirmé (EF-12)', () => {
    window.sessionStorage.setItem(
      'learny.pendingAuth',
      JSON.stringify({
        email: 'alex.perrin@exemple.fr',
        method: 'password',
        intent: 'signup',
        sentAt: NOW,
        notice: 'confirmation_resent',
      }),
    );
    renderComponent(<VerifyEmailCard />);
    expect(screen.getByTestId('verify-status').textContent).toBe(
      'Confirmez d’abord votre adresse : nous venons de vous renvoyer le lien.',
    );
  });
});
