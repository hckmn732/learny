// Component tests of the callback route (SPEC-3101 EF-6, EF-7, CL-4, CA-3).
//
// The link is injected through `useLocalSearchParams`, the Auth client through `native-auth` and
// the session through its port: no network and no native Auth client.
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { SessionProvider } from '../../src/auth/session';
import type { SessionPort, SessionSnapshot } from '../../src/auth/session-port';
import { CallbackScreen } from '../../src/features/auth/CallbackScreen';

const mockReplace = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve(undefined));
const mockParams: { value: Record<string, string | string[] | undefined> } = { value: {} };
const mockVerify = jest.fn<Promise<SessionSnapshot>, [unknown, string, string]>(() =>
  Promise.reject(new Error('vérification inattendue')),
);
const mockExchange = jest.fn<Promise<SessionSnapshot>, [unknown, string]>(() =>
  Promise.reject(new Error('échange inattendu')),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
  useLocalSearchParams: () => mockParams.value,
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/auth/native-auth', () => ({
  emailAuthClient: () => ({ fake: 'client' }),
}));

jest.mock('../../src/auth/email-auth', () => ({
  MAGIC_LINK_REDIRECT: 'learny://auth/callback',
  CALLBACK_TYPES: ['magiclink', 'signup', 'email'],
  signInWithPassword: jest.fn(),
  requestMagicLink: jest.fn(),
  verifyMagicLink: (...args: [unknown, string, string]) => mockVerify(...args),
  exchangeMagicCode: (...args: [unknown, string]) => mockExchange(...args),
}));

const ALEX: SessionSnapshot = {
  userId: 'u-alex',
  accessToken: 'jeton-acces',
  email: 'alex.perrin@demo.learny.test',
};

function fakePort(initial: SessionSnapshot | null): SessionPort & { calls: string[] } {
  const calls: string[] = [];
  let current = initial;
  const listeners = new Set<(snapshot: SessionSnapshot | null) => void>();
  const publish = (snapshot: SessionSnapshot | null): void => {
    current = snapshot;
    for (const listener of listeners) listener(current);
  };
  return {
    calls,
    current() {
      calls.push('current');
      return Promise.resolve(current);
    },
    onSnapshot(listener) {
      listeners.add(listener);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
    refresh() {
      calls.push('refresh');
      return Promise.resolve(current);
    },
    signInWithPassword() {
      calls.push('signIn');
      publish(ALEX);
      return Promise.resolve(ALEX);
    },
    signOut() {
      calls.push('signOut');
      publish(null);
      return Promise.resolve();
    },
  };
}

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 1080, height: 2400 },
  insets: { top: 120, left: 0, right: 0, bottom: 48 },
};

function renderCallback(port: SessionPort): ReturnType<typeof render> {
  return render(
    <SessionProvider port={port}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <CallbackScreen />
      </SafeAreaProvider>
    </SessionProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockVerify.mockReset();
  mockExchange.mockReset();
  mockParams.value = {};
});

describe('[SPEC-3101] retour d’un lien dans l’application', () => {
  it('refuse un lien sans paramètre utile (CA-3)', async () => {
    const view = await renderCallback(fakePort(null));

    await waitFor(() => {
      expect(view.getByTestId('auth-callback-error')).toBeTruthy();
    });
    expect(view.getAllByText(fr.mobile.auth.callback.invalid).length).toBeGreaterThan(0);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('échange un lien de confirmation par token_hash et rejoint la coquille (EF-6, EF-7)', async () => {
    mockParams.value = { token_hash: 'hash-du-lien', type: 'signup' };
    mockVerify.mockResolvedValue(ALEX);
    const view = await renderCallback(fakePort(null));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith({ fake: 'client' }, 'hash-du-lien', 'signup');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/aujourdhui');
    });
    expect(view.queryByTestId('auth-callback-error')).toBeNull();
  });

  it('échange le code d’un lien universel (EF-6)', async () => {
    mockParams.value = { code: 'code-pkce' };
    mockExchange.mockResolvedValue(ALEX);
    await renderCallback(fakePort(null));

    await waitFor(() => {
      expect(mockExchange).toHaveBeenCalledWith({ fake: 'client' }, 'code-pkce');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/aujourdhui');
    });
  });

  it('ferme et purge la session courante avant d’ouvrir le lien d’un autre compte (CL-4)', async () => {
    const port = fakePort(ALEX);
    mockParams.value = { token_hash: 'hash-du-lien', type: 'magiclink' };
    mockVerify.mockResolvedValue({ ...ALEX, userId: 'u-autre' });
    await renderCallback(port);

    await waitFor(() => {
      expect(port.calls).toContain('signOut');
    });
    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });
  });

  it('affiche « Ce lien n’est plus valide » sur un lien déjà utilisé (CA-3)', async () => {
    mockParams.value = { token_hash: 'hash-usage', type: 'magiclink' };
    mockVerify.mockRejectedValue({ code: 'otp_expired', status: 403 });
    const view = await renderCallback(fakePort(null));

    await waitFor(() => {
      expect(view.getByTestId('auth-callback-error')).toBeTruthy();
    });
    expect(view.getAllByText(fr.mobile.auth.callback.invalid).length).toBeGreaterThan(0);
    expect(view.getByTestId('auth-callback-ask')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
