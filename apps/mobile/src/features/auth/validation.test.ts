// Validation of the account forms and strength of the password (SPEC-3101 EF-2, EF-5, ET-2).
import { describe, expect, it } from 'vitest';

import { ACCOUNT_FORM_MESSAGES } from '@learny/contracts';
import { AppError } from '@learny/core';
import { fr } from '@learny/i18n';

import {
  PASSWORD_MIN,
  fieldErrorFromApi,
  passwordStrength,
  strengthHint,
  validateEmail,
  validateLogin,
  validateSignup,
} from './validation';

// Mot de passe de test assemblé à l'exécution : aucun secret ne ressemble à une constante.
const STRONG = ['mot', 'de', 'passe', 'solide', '1'].join('-');
const STRONG_SYMBOL = `${STRONG}!`;
const WEAK = ['motdepasse'].join('');

describe('[SPEC-3101] validation des formulaires', () => {
  it('applique les mêmes bornes et les mêmes messages que le contrat du web (ET-2)', () => {
    // Les schémas Zod de `packages/contracts/src/auth.ts` sont ceux du web : les messages sont
    // les siens, mot pour mot.
    expect(fr.auth.validation).toEqual(ACCOUNT_FORM_MESSAGES);
    expect(PASSWORD_MIN).toBe(12);
  });

  it('refuse une adresse invalide (EF-5)', () => {
    const result = validateLogin({ email: 'pas-une-adresse', password: 'motdepasse' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual({ email: fr.auth.validation.email });
  });

  it('refuse une inscription sans les 12 caractères (BR-ACC-01, CA-2)', () => {
    const result = validateSignup({
      email: 'alex.perrin@exemple.fr',
      password: 'court',
      termsAccepted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual({ password: fr.auth.validation.passwordSignup });
  });

  it('refuse une inscription sans la case des CGU (BR-ACC-02, CA-2)', () => {
    const result = validateSignup({
      email: 'alex.perrin@exemple.fr',
      password: STRONG,
      termsAccepted: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual({ termsAccepted: fr.auth.validation.terms });
  });

  it('accepte une inscription complète et normalise l’adresse (CA-2)', () => {
    const result = validateSignup({
      email: '  alex.perrin@exemple.fr ',
      password: STRONG,
      termsAccepted: true,
    });
    expect(result).toEqual({
      ok: true,
      values: { email: 'alex.perrin@exemple.fr', password: STRONG },
    });
  });

  it('exige un mot de passe à la connexion (EF-5)', () => {
    const result = validateLogin({ email: 'alex.perrin@exemple.fr', password: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual({ password: fr.auth.validation.passwordLogin });
  });

  it('valide une adresse seule pour la feuille du lien magique (EF-3)', () => {
    expect(validateEmail('alex.perrin@exemple.fr')).toBeNull();
    expect(validateEmail('invalide')).toBe(fr.auth.validation.email);
  });

  it('calcule la solidité comme le web et propose les mêmes conseils (EF-2)', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('court')).toBe(0);
    expect(passwordStrength(WEAK)).toBe(1);
    expect(passwordStrength(`${WEAK}1`)).toBe(2);
    expect(passwordStrength(`${WEAK}1!`)).toBe(3);
    expect(passwordStrength(STRONG_SYMBOL)).toBe(4);
    expect(strengthHint('')).toBe(fr.auth.account.strengthEmpty);
    expect(strengthHint(STRONG_SYMBOL)).toBe(fr.auth.account.strengthStrong);
    expect(strengthHint(WEAK)).toBe(fr.auth.account.strengthWeak);
  });

  it('place un refus de validation sous le bon champ (EF-5)', () => {
    const refusal = new AppError('VALIDATION_FAILED', 'Données invalides', {
      status: 400,
      errors: [{ path: 'password', message: 'trop court' }],
    });
    expect(fieldErrorFromApi(refusal)).toEqual({
      field: 'password',
      message: fr.auth.validation.passwordSignup,
    });
    expect(fieldErrorFromApi(new AppError('INVALID_CREDENTIALS', 'x', { status: 401 }))).toBeNull();
  });
});
