// Vitest [SPEC-3003] — single renewal of the session (ET-2, CL-1, CL-2).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getSessionToken,
  refreshSessionOnce,
  resetSessionTokenState,
  setExpiredHandler,
  setRenewalHandler,
  setSessionToken,
} from './session-token';

afterEach(() => {
  resetSessionTokenState();
});

describe('[SPEC-3003] renouvellement sérialisé du jeton (ET-2, CL-1)', () => {
  it('ne renouvelle qu’une fois pour dix appels concurrents (CL-1)', async () => {
    const renewal = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('jeton-neuf');
          }, 10);
        }),
    );
    setRenewalHandler(renewal);

    const results = await Promise.all(Array.from({ length: 10 }, () => refreshSessionOnce()));

    expect(renewal).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result)).toBe(true);
    expect(getSessionToken()).toBe('jeton-neuf');
  });

  it('autorise un nouveau renouvellement une fois le premier terminé', async () => {
    const renewal = vi.fn(() => Promise.resolve('jeton-1'));
    setRenewalHandler(renewal);

    await refreshSessionOnce();
    await refreshSessionOnce();

    expect(renewal).toHaveBeenCalledTimes(2);
  });

  it('déconnecte et prévient une seule fois quand le renouvellement est refusé (CL-2)', async () => {
    const expired = vi.fn();
    setExpiredHandler(expired);
    setRenewalHandler(() => Promise.resolve(null));
    setSessionToken('jeton-perime');

    const results = await Promise.all(Array.from({ length: 5 }, () => refreshSessionOnce()));

    expect(results.every((result) => !result)).toBe(true);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getSessionToken()).toBeNull();
  });

  it('déconnecte aussi quand le renouvellement lève une erreur', async () => {
    const expired = vi.fn();
    setExpiredHandler(expired);
    setRenewalHandler(() => Promise.reject(new Error('refresh token révoqué')));

    await expect(refreshSessionOnce()).resolves.toBe(false);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('échoue proprement quand aucun renouvellement n’est installé', async () => {
    const expired = vi.fn();
    setExpiredHandler(expired);

    await expect(refreshSessionOnce()).resolves.toBe(false);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('expose le jeton courant au client d’API (EF-2)', () => {
    setSessionToken('jeton-courant');
    expect(getSessionToken()).toBe('jeton-courant');
    setSessionToken(null);
    expect(getSessionToken()).toBeNull();
  });
});
