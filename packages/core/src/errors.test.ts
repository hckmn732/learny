import { describe, expect, it } from 'vitest';

import { AppError, ERROR_CATALOG, errorCodeToKebab, toProblem } from './errors';
import { err, ok } from './result';

describe("[SPEC-201] catalogue d'erreurs", () => {
  it('declares a status and a French title for every code', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(code, code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThan(600);
      expect(entry.title.length).toBeGreaterThan(2);
    }
  });

  it.each([
    ['VALIDATION_FAILED', 400, 'Données invalides'],
    ['IDEMPOTENCY_KEY_REQUIRED', 400, "Clé d'idempotence manquante"],
    ['UNAUTHENTICATED', 401, 'Connexion requise'],
    ['EMAIL_NOT_CONFIRMED', 403, 'Adresse e-mail non vérifiée'],
    ['INVALID_SIGNATURE', 400, 'Signature invalide'],
    ['IDEMPOTENCY_IN_PROGRESS', 409, 'Requête déjà en cours'],
    ['ALREADY_SUBSCRIBED', 409, 'Abonnement déjà actif'],
    ['PAYLOAD_TOO_LARGE', 413, 'Requête trop volumineuse'],
    ['IDEMPOTENCY_KEY_REUSED', 422, "Clé d'idempotence déjà utilisée"],
    ['FORMATION_LIMIT_REACHED', 422, 'Trois formations actives au plus'],
    ['RATE_LIMITED', 429, 'Trop de requêtes'],
    ['INTERNAL_ERROR', 500, 'Erreur interne'],
  ] as const)('%s → %i « %s »', (code, status, title) => {
    expect(ERROR_CATALOG[code]).toEqual({ status, title });
  });

  it('turns an error into a RFC 9457 problem with a kebab-case type', () => {
    const problem = toProblem(
      new AppError('FORMATION_LIMIT_REACHED', 'Trois formations actives au plus.'),
      'req-12345678',
    );
    expect(problem).toEqual({
      type: 'https://learny.app/errors/formation-limit-reached',
      title: 'Trois formations actives au plus',
      status: 422,
      detail: 'Trois formations actives au plus.',
      code: 'FORMATION_LIMIT_REACHED',
      requestId: 'req-12345678',
    });
    expect(errorCodeToKebab('IDEMPOTENCY_KEY_REUSED')).toBe('idempotency-key-reused');
  });

  it('exposes `errors` only for VALIDATION_FAILED', () => {
    const errors = [{ path: 'body.title', message: 'Requis' }];
    const validation = toProblem(new AppError('VALIDATION_FAILED', 'Invalide.', { errors }), 'r1');
    expect(validation.errors).toEqual(errors);
    const other = toProblem(new AppError('CONFLICT', 'Conflit.', { errors }), 'r1');
    expect(other).not.toHaveProperty('errors');
  });

  it('never echoes the message of an unexpected or server error', () => {
    const unexpected = toProblem(new Error('secret SQL: select * from users'), 'req-1');
    expect(unexpected.code).toBe('INTERNAL_ERROR');
    expect(unexpected.status).toBe(500);
    expect(unexpected.detail).toBe('Une erreur inattendue est survenue. Référence : req-1.');
    const server = toProblem(new AppError('INTERNAL_ERROR', 'fuite interne'), 'req-2');
    expect(JSON.stringify(server)).not.toContain('fuite');
    const unknownCode = toProblem(new AppError('NOT_IN_CATALOG', 'x'), 'req-3');
    expect(unknownCode.code).toBe('INTERNAL_ERROR');
  });

  it('keeps retryAfterSec on the error', () => {
    expect(new AppError('RATE_LIMITED', 'Attendez.', { retryAfterSec: 7 }).retryAfterSec).toBe(7);
  });

  it('builds results', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    const error = new AppError('NOT_FOUND', 'Introuvable.');
    expect(err(error)).toEqual({ ok: false, error });
  });
});
