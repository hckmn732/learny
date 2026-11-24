// Vitest [SPEC-3402] — échange du jeton d'identité, nom du profil et marqueur légal (EF-2, EF-4,
// ET-1, CA-2; BR-ACC-02). Le client d'authentification et l'API sont injectés : aucun module natif.
import { describe, expect, it, vi } from 'vitest';

import { hasLegalAcceptance, legalMarkerKey, rememberLegalAcceptance } from './legal-cache';
import {
  applyProviderName,
  signInWithProviderToken,
  type ProviderAccessApi,
  type ProviderAuthClient,
} from './provider-access';
import type { SecureSessionStorage } from './secure-storage';
import { getSessionToken } from './session-token';

function authClient(overrides: Partial<ProviderAuthClient> = {}): ProviderAuthClient {
  return {
    signInWithIdToken: vi.fn(() =>
      Promise.resolve({
        error: null,
        data: { session: { access_token: 'jeton-acces', user: { id: 'u-1', email: 'a@b.fr' } } },
      }),
    ),
    getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('[SPEC-3402] échange du jeton d’identité', () => {
  it('transmet le fournisseur, le jeton et le nonce brut, puis publie le jeton d’accès (EF-2, EF-3)', async () => {
    const signInWithIdToken = vi.fn(() =>
      Promise.resolve({
        error: null,
        data: { session: { access_token: 'jeton-acces', user: { id: 'u-1', email: 'a@b.fr' } } },
      }),
    );
    const client = authClient({ signInWithIdToken });
    const session = await signInWithProviderToken(client, 'apple', {
      status: 'idToken',
      idToken: 'jeton-identite',
      nonce: 'nonce-brut',
      name: null,
    });
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'jeton-identite',
      nonce: 'nonce-brut',
    });
    expect(session).toEqual({ userId: 'u-1', accessToken: 'jeton-acces', email: 'a@b.fr' });
    expect(getSessionToken()).toBe('jeton-acces');
  });

  it('refuse un fournisseur qui n’a pas renvoyé de jeton (CL-2)', async () => {
    const client = authClient({
      signInWithIdToken: vi.fn(() => Promise.resolve({ error: null, data: { session: null } })),
    });
    await expect(
      signInWithProviderToken(client, 'google', {
        status: 'idToken',
        idToken: 'x',
        nonce: null,
        name: null,
      }),
    ).rejects.toThrow(/session/i);
  });
});

describe('[SPEC-3402] nom du profil (EF-2)', () => {
  it('remplit seulement les champs vides', async () => {
    const updateProfile = vi.fn(() => Promise.resolve());
    const api: ProviderAccessApi = {
      me: vi.fn(() => Promise.resolve({ firstName: null, lastName: null })),
      updateProfile,
    };
    await applyProviderName(api, { firstName: 'Camille', lastName: 'Durand' });
    expect(updateProfile).toHaveBeenCalledWith({ firstName: 'Camille', lastName: 'Durand' });

    updateProfile.mockClear();
    const filled: ProviderAccessApi = {
      me: vi.fn(() => Promise.resolve({ firstName: 'Alex', lastName: 'Perrin' })),
      updateProfile,
    };
    await applyProviderName(filled, { firstName: 'Camille', lastName: 'Durand' });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('ne touche à rien sans nom annoncé (CL-3)', async () => {
    const me = vi.fn();
    await applyProviderName({ me, updateProfile: vi.fn() }, null);
    expect(me).not.toHaveBeenCalled();
  });
});

describe('[SPEC-3402] marqueur d’acceptation légale', () => {
  function storage(): SecureSessionStorage & { entries: Map<string, string> } {
    const entries = new Map<string, string>();
    return {
      entries,
      getItem: (key: string) => Promise.resolve(entries.get(key) ?? null),
      setItem: (key: string, value: string) => {
        entries.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        entries.delete(key);
        return Promise.resolve();
      },
      clear: () => {
        entries.clear();
        return Promise.resolve();
      },
    };
  }

  it('retient une acceptation par compte (CA-2)', async () => {
    const backend = storage();
    await expect(hasLegalAcceptance(backend, 'u-1')).resolves.toBe(false);
    await rememberLegalAcceptance(backend, 'u-1');
    await expect(hasLegalAcceptance(backend, 'u-1')).resolves.toBe(true);
    expect(backend.entries.has(legalMarkerKey('u-1'))).toBe(true);
    await expect(hasLegalAcceptance(backend, 'u-2')).resolves.toBe(false);
  });
});
