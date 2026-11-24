// Vitest [SPEC-3402] — messages des échecs de fournisseur (EF-5, EF-6, CL-2).
import { describe, expect, it } from 'vitest';

import { fr } from '@learny/i18n';

import { providerFailureOf } from './errors';

describe('[SPEC-3402] échecs des fournisseurs', () => {
  it('garde le silence sur une annulation, par code comme par message (EF-5, CA-3)', () => {
    expect(providerFailureOf({ code: 'SIGN_IN_CANCELLED', message: 'cancelled' })).toMatchObject({
      kind: 'cancelled',
      message: '',
    });
    expect(providerFailureOf({ message: 'The user canceled the sign-in flow.' })).toMatchObject({
      kind: 'cancelled',
    });
  });

  it('explique un fournisseur refusé par Supabase (CL-2)', () => {
    expect(providerFailureOf({ code: 'provider_disabled', message: '' })).toMatchObject({
      kind: 'unavailable',
      message: fr.mobile.auth.providers.unavailable,
    });
    expect(providerFailureOf({ message: 'Provider is not enabled (apple)' })).toMatchObject({
      kind: 'unavailable',
    });
  });

  it('annonce le compte existant par mot de passe (EF-6)', () => {
    expect(providerFailureOf({ code: 'identity_already_exists', message: '' })).toMatchObject({
      kind: 'accountExists',
      message: fr.mobile.auth.providers.accountExists,
    });
  });

  it('classe le réseau et l’inconnu (CL-1, CL-2)', () => {
    expect(providerFailureOf({ message: 'Network request failed' })).toMatchObject({
      kind: 'network',
    });
    expect(providerFailureOf(new Error('boom'))).toMatchObject({ kind: 'generic' });
  });
});
