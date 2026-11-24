// Vitest [SPEC-3003] — French messages of the API errors (EF-7, BR-PLA-08).
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  GENERIC_ERROR_MESSAGE,
  isSessionExpired,
  messageFor,
  retryAfterMs,
  sessionExpiredMessage,
} from './errors';

describe('[SPEC-3003] messages français des erreurs (EF-7)', () => {
  it('rend le message générique pour une valeur qui n’est pas une erreur de l’API', () => {
    expect(messageFor(new Error('boom'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(messageFor(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(messageFor('texte')).toBe(GENERIC_ERROR_MESSAGE);
    expect(GENERIC_ERROR_MESSAGE).toBe('Une erreur est survenue. Réessayez.');
  });

  it('traduit un code connu du catalogue', () => {
    expect(messageFor(new AppError('NOT_FOUND', 'Détail technique'))).toBe('Élément introuvable.');
    expect(messageFor(new AppError('VALIDATION_FAILED', 'Détail'))).toBe(
      'Certaines données sont invalides.',
    );
    expect(messageFor(new AppError('FORBIDDEN', 'Détail'))).toBe('Accès refusé.');
    expect(messageFor(new AppError('CONFLICT', 'Détail'))).toBe('Conflit : réessayez.');
  });

  it('retombe sur le titre du catalogue puis sur le message générique', () => {
    // A code of the catalogue without a refinement for the mobile client.
    expect(messageFor(new AppError('MODULE_LOCKED', 'Détail'))).toBe('Module verrouillé');
    // A code the local catalogue does not know yet: never the technical detail.
    const unknown = new AppError('CODE_INCONNU', 'Détail interne, jamais affiché');
    expect(messageFor(unknown)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('affiche le délai de Retry-After pour un 429 (BR-PLA-08)', () => {
    const limited = new AppError('RATE_LIMITED', 'Trop de requêtes', {
      status: 429,
      retryAfterSec: 7,
    });
    expect(messageFor(limited)).toBe('Trop de requêtes. Réessayez dans 7 s.');
    expect(retryAfterMs(limited)).toBe(7000);
  });

  it('utilise un plancher d’une seconde quand Retry-After manque', () => {
    expect(messageFor(new AppError('RATE_LIMITED', 'Trop de requêtes', { status: 429 }))).toBe(
      'Trop de requêtes. Réessayez dans 1 s.',
    );
    expect(retryAfterMs(new AppError('RATE_LIMITED', 'x', { status: 429 }))).toBe(0);
  });

  it('annonce la session expirée pour un 401 (EF-3, CL-2)', () => {
    expect(messageFor(new AppError('UNAUTHENTICATED', 'x', { status: 401 }))).toBe(
      'Votre session a expiré. Reconnectez-vous.',
    );
    expect(sessionExpiredMessage()).toBe('Votre session a expiré. Reconnectez-vous.');
    expect(isSessionExpired(new AppError('UNAUTHENTICATED', 'x', { status: 401 }))).toBe(true);
    // Bad credentials are a sign-in failure, not an expired session.
    expect(isSessionExpired(new AppError('INVALID_CREDENTIALS', 'x', { status: 401 }))).toBe(false);
  });

  it('traduit une panne réseau (BR-PLA-08)', () => {
    expect(messageFor(new AppError('NETWORK_ERROR', 'x'))).toBe(
      'Le serveur est injoignable. Vérifiez votre connexion.',
    );
  });
});
