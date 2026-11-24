// Reading of the links that open the application (SPEC-3101 EF-6, CL-3).
import { describe, expect, it } from 'vitest';

import { parseAuthLink } from './deep-link';

describe('[SPEC-3101] lecture des liens entrants', () => {
  it('reconnaît le code d’un lien universel (EF-6)', () => {
    expect(parseAuthLink({ code: 'abc-123' })).toEqual({ kind: 'code', code: 'abc-123' });
  });

  it('reconnaît un lien de confirmation porté par les e-mails du projet', () => {
    expect(parseAuthLink({ token_hash: 'hash', type: 'signup' })).toEqual({
      kind: 'token',
      tokenHash: 'hash',
      type: 'signup',
    });
  });

  it('reconnaît un lien magique', () => {
    expect(parseAuthLink({ token_hash: 'hash', type: 'magiclink' })).toEqual({
      kind: 'token',
      tokenHash: 'hash',
      type: 'magiclink',
    });
  });

  it('refuse un type inconnu plutôt que de le transmettre (EF-6)', () => {
    expect(parseAuthLink({ token_hash: 'hash', type: 'recovery' })).toEqual({ kind: 'invalid' });
  });

  it('refuse un lien sans paramètre utile (CA-3)', () => {
    expect(parseAuthLink({})).toEqual({ kind: 'invalid' });
    expect(parseAuthLink({ token_hash: 'hash' })).toEqual({ kind: 'invalid' });
    expect(parseAuthLink({ code: '   ' })).toEqual({ kind: 'invalid' });
  });

  it('accepte une valeur répétée dans la requête (Expo Router)', () => {
    expect(parseAuthLink({ code: ['premier', 'second'] })).toEqual({
      kind: 'code',
      code: 'premier',
    });
  });
});
