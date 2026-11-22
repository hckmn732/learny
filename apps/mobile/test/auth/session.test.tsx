// Component tests of the session (SPEC-3003 EF-1, EF-3, CA-2; ADR-3008).
//
// The provider is rendered with an injected port: no native Auth client, no network, and the
// three states of the start-up are asserted directly. The refused renewal goes through the real
// `src/auth/session-token.ts` (the serialised renewal), so the test also covers CL-1/CL-2.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Pressable, Text } from 'react-native';

import { SessionProvider, useSession } from '../../src/auth/session';
import type { SessionPort, SessionSnapshot } from '../../src/auth/session-port';
import { refreshSessionOnce, resetSessionTokenState, getSessionToken } from '../../src/auth/session-token';

const ALEX: SessionSnapshot = {
  userId: 'u-alex',
  accessToken: 'jeton-acces-alex',
  email: 'alex.perrin@demo.learny.test',
};

interface FakePort extends SessionPort {
  readonly calls: string[];
}

function fakePort(initial: SessionSnapshot | null, options: { renew?: boolean } = {}): FakePort {
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
      if (options.renew === false) return Promise.resolve(null);
      publish({ ...ALEX, accessToken: 'jeton-renouvele' });
      return Promise.resolve(current);
    },
    signInWithPassword(email, password) {
      calls.push(`signIn:${email}:${password}`);
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

function Probe(): ReactElement {
  const session = useSession();
  return (
    <>
      <Text testID="session-status">{session.status}</Text>
      <Text testID="session-user">{session.userId ?? 'aucun'}</Text>
      <Text testID="session-token">{session.accessToken() ?? 'aucun'}</Text>
      <Text testID="session-expired">{session.expiredNotice ?? 'aucun'}</Text>
      <Text testID="session-error">{session.error ?? 'aucun'}</Text>
      <Pressable
        testID="sign-in"
        accessibilityRole="button"
        onPress={() => {
          void session.signIn('alex.perrin@demo.learny.test', 'mot-de-passe');
        }}
      >
        <Text>Se connecter</Text>
      </Pressable>
      <Pressable
        testID="sign-out"
        accessibilityRole="button"
        onPress={() => {
          void session.signOut();
        }}
      >
        <Text>Se déconnecter</Text>
      </Pressable>
    </>
  );
}

function renderWith(port: SessionPort, purge = jest.fn(() => Promise.resolve())) {
  return render(
    <SessionProvider port={port} purge={purge}>
      <Probe />
    </SessionProvider>,
  );
}

afterEach(() => {
  resetSessionTokenState();
});

describe('[SPEC-3003] session de l’application (EF-1)', () => {
  it('passe de « loading » à « signedIn » quand la session est restaurée (CL-4)', async () => {
    const port = fakePort(ALEX);
    await renderWith(port);

    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedIn'); });
    expect(screen.getByTestId('session-user')).toHaveTextContent('u-alex');
    expect(screen.getByTestId('session-token')).toHaveTextContent('jeton-acces-alex');
    expect(port.calls).toContain('current');
  });

  it('reste « signedOut » sans session enregistrée', async () => {
    await renderWith(fakePort(null));

    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedOut'); },
    );
    expect(screen.getByTestId('session-user')).toHaveTextContent('aucun');
    expect(screen.getByTestId('session-token')).toHaveTextContent('aucun');
  });

  it('se connecte par mot de passe et publie le jeton pour le client d’API (EF-2)', async () => {
    const port = fakePort(null);
    await renderWith(port);
    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedOut'); },
    );

    await fireEvent.press(screen.getByTestId('sign-in'));

    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedIn'); });
    expect(port.calls).toContain('signIn:alex.perrin@demo.learny.test:mot-de-passe');
    expect(screen.getByTestId('session-token')).toHaveTextContent('jeton-acces-alex');
  });

  it('purge les données du compte à la déconnexion (EF-6)', async () => {
    const purge = jest.fn(() => Promise.resolve());
    await renderWith(fakePort(ALEX), purge);
    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedIn'); });

    await fireEvent.press(screen.getByTestId('sign-out'));

    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedOut'); },
    );
    expect(purge).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('session-token')).toHaveTextContent('aucun');
  });
});

describe('[SPEC-3003] session expirée (EF-3, CL-2)', () => {
  it('déconnecte, purge et affiche le message quand le renouvellement est refusé', async () => {
    const purge = jest.fn(() => Promise.resolve());
    const port = fakePort(ALEX, { renew: false });
    await renderWith(port, purge);
    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedIn'); });

    let renewed = true;
    await act(async () => {
      renewed = await refreshSessionOnce();
    });

    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedOut'); },
    );
    expect(renewed).toBe(false);
    expect(port.calls).toContain('refresh');
    expect(port.calls).toContain('signOut');
    expect(purge).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('session-expired')).toHaveTextContent(
      'Votre session a expiré. Reconnectez-vous.',
    );
  });

  it('renouvelle une seule fois pour dix appels concurrents et garde la session (CL-1)', async () => {
    const port = fakePort(ALEX);
    await renderWith(port);
    await waitFor(() => { expect(screen.getByTestId('session-status')).toHaveTextContent('signedIn'); });

    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all(Array.from({ length: 10 }, () => refreshSessionOnce()));
    });

    expect(results).toHaveLength(10);
    expect(results.every((value) => value)).toBe(true);
    expect(port.calls.filter((call) => call === 'refresh')).toHaveLength(1);
    // The token published to the API client is the renewed one (EF-2): `src/api/client.ts` reads
    // this module, not the React state.
    expect(getSessionToken()).toBe('jeton-renouvele');
  });
});
