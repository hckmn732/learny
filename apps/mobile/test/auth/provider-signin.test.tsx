/* eslint-disable import/order -- la fabrique jest.mock doit précéder l'import du hook */
// Jest + RNTL [SPEC-3402] — séquence du fournisseur : annulation, double appui, erreurs et
// acceptation des CGU avant l'accès (EF-5, EF-6, CL-2, CL-4, CA-2, CA-3).
import { act, renderHook } from '@testing-library/react-native';

import { fr } from '@learny/i18n';

import { MOBILE_LEGAL_VERSIONS } from '../../src/auth/legal-versions';

import { isNavigationHeld } from '../../src/auth/navigation-hold';

const mockSignIn = jest.fn();
const mockHasLegal = jest.fn();
const mockRemember = jest.fn();

jest.mock('../../src/auth/providers', () => ({
  providerFor: () => ({
    id: 'google',
    isAvailable: () => Promise.resolve(true),
    signIn: mockSignIn,
  }),
  isMockProviderEnabled: () => false,
}));

const mockAuth = {
  signInWithIdToken: jest.fn(),
  getSession: jest.fn(),
  signOut: jest.fn(() => Promise.resolve({ error: null })),
};

jest.mock('../../src/auth/supabase', () => ({
  supabase: () => ({ auth: mockAuth }),
}));

const mockApi = {
  meGet: jest.fn(),
  meUpdate: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

jest.mock('../../src/auth/legal-cache', () => ({
  hasLegalAcceptance: async (...args: unknown[]): Promise<boolean> => {
    const accepted: unknown = await mockHasLegal(...args);
    return accepted === true;
  },
  rememberLegalAcceptance: (...args: unknown[]) => {
    mockRemember(...args);
    return Promise.resolve();
  },
}));

import { useProviderSignIn } from '../../src/features/auth/useProviderSignIn';

beforeEach(() => {
  jest.clearAllMocks();
  mockHasLegal.mockReset();
  mockHasLegal.mockResolvedValue(false);
  mockRemember.mockReset();
  mockAuth.signInWithIdToken.mockResolvedValue({
    error: null,
    data: { session: { access_token: 'jeton', user: { id: 'u-1', email: 'camille@test.fr' } } },
  });
  mockApi.meGet.mockResolvedValue({ firstName: null, lastName: null });
  mockApi.meUpdate.mockResolvedValue({});
});

describe('[SPEC-3402] connexion par fournisseur', () => {
  it('ne montre rien quand l’utilisateur annule (EF-5, CA-3)', async () => {
    mockSignIn.mockResolvedValue({ status: 'cancelled' });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('google');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.legalVersions).toBeNull();
    expect(mockApi.meGet).not.toHaveBeenCalled();
    expect(isNavigationHeld()).toBe(false);
  });

  it('n’ouvre qu’une fenêtre sur un double appui (CL-4)', async () => {
    let release: (value: { status: 'cancelled' }) => void = () => undefined;
    mockSignIn.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      const first = result.current.signIn('google');
      const second = result.current.signIn('google');
      release({ status: 'cancelled' });
      await first;
      await second;
    });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('explique un fournisseur refusé et journalise le code, jamais le jeton (CL-2)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSignIn.mockRejectedValue({ code: 'provider_disabled', message: 'Provider is not enabled' });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('apple');
    });
    expect(result.current.error).toBe(fr.mobile.auth.providers.unavailable);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('provider_disabled');
    expect(logged).not.toContain('jeton');
    warn.mockRestore();
  });

  it('annonce un compte déjà existant par mot de passe (EF-6)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSignIn.mockRejectedValue({ code: 'identity_already_exists', message: '' });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('google');
    });
    expect(result.current.error).toBe(fr.mobile.auth.providers.accountExists);
    warn.mockRestore();
  });

  it('impose les CGU avant l’accès puis applique le nom du profil (CA-2, EF-2)', async () => {
    mockSignIn.mockResolvedValue({
      status: 'idToken',
      idToken: 'jeton-identite',
      nonce: null,
      name: { firstName: 'Camille', lastName: 'Durand' },
    });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('google');
    });
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'jeton-identite',
    });
    expect(result.current.legalVersions).toEqual(MOBILE_LEGAL_VERSIONS);
    expect(isNavigationHeld()).toBe(true);
    expect(mockApi.meUpdate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.legalAccepted();
    });
    expect(mockRemember).toHaveBeenCalled();
    expect(mockApi.meUpdate).toHaveBeenCalledWith({
      body: { firstName: 'Camille', lastName: 'Durand' },
    });
    expect(isNavigationHeld()).toBe(false);
  });

  it('ouvre l’accès sans feuille quand l’acceptation est déjà connue', async () => {
    mockHasLegal.mockResolvedValue(true);
    mockSignIn.mockResolvedValue({
      status: 'idToken',
      idToken: 'jeton-identite',
      nonce: 'nonce-brut',
      name: null,
    });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('google');
    });
    expect(result.current.legalVersions).toBeNull();
    expect(isNavigationHeld()).toBe(false);
  });

  it('abandonne la connexion quand « Plus tard » est choisi (BR-ACC-02)', async () => {
    mockSignIn.mockResolvedValue({
      status: 'idToken',
      idToken: 'jeton-identite',
      nonce: null,
      name: null,
    });
    const { result } = await renderHook(() => useProviderSignIn());
    await act(async () => {
      await result.current.signIn('apple');
    });
    await act(async () => {
      await Promise.resolve();
      result.current.legalDismissed();
    });
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(isNavigationHeld()).toBe(false);
    expect(result.current.error).toBe(fr.mobile.auth.providers.legalRequired);
  });
});
