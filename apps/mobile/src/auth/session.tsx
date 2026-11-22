// Session of the application (SPEC-3003 EF-1, EF-3, CL-2, CL-4; ADR-3008 § 1 à § 3).
//
// `useSession()` exposes the three states of the start-up — `loading`, `signedOut`, `signedIn` —
// and the operations the screens need. The provider:
// - restores the session from the encrypted storage at start-up (CL-4);
// - publishes the access token to the API client through `src/auth/session-token.ts` (EF-2);
// - serialises the renewal: `refreshSessionOnce()` is the only way to renew (ET-2, CL-1);
// - on a refused renewal, signs out locally, purges the account data and keeps the label of the
//   sign-in screen (« Votre session a expiré. Reconnectez-vous. », EF-3, CL-2).
//
// The port is injected: the Jest tests render the provider with a fake session, so no native Auth
// client is ever started in a test.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { messageFor, sessionExpiredMessage } from '../api/errors';
import { requireApiClient } from '../api/registry';
import { appQueryClient } from '../data/query-client';
import { purgeUserData } from '../offline/purge';

import { secureSessionStorage } from './secure-backend';
import type { SessionPort, SessionSnapshot } from './session-port';
import { setExpiredHandler, setRenewalHandler, setSessionToken } from './session-token';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionValue {
  readonly status: SessionStatus;
  readonly userId: string | null;
  /** Current access token, read by the API client (never displayed). */
  readonly accessToken: () => string | null;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Label of the sign-in screen after a refused renewal (EF-3); `null` otherwise. */
  readonly expiredNotice: string | null;
  /** French message of the last failed sign-in; `null` when there is none. */
  readonly error: string | null;
  readonly busy: boolean;
}

export interface SessionProviderProps {
  readonly port: SessionPort;
  readonly children: ReactNode;
  /** Purge of the account data; signed-out and expired sessions call it (EF-6). */
  readonly purge?: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Default purge: query cache, persisted cache and offline queue of the encrypted store (EF-6). */
function defaultPurge(): Promise<void> {
  return purgeUserData({ queryClient: appQueryClient, storage: secureSessionStorage }).then(
    () => undefined,
  );
}

export function SessionProvider({
  port,
  children,
  purge = defaultPurge,
}: SessionProviderProps): ReactElement {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef<string | null>(null);

  const apply = useCallback((snapshot: SessionSnapshot | null) => {
    token.current = snapshot?.accessToken ?? null;
    setSessionToken(token.current);
    setUserId(snapshot?.userId ?? null);
    setStatus(snapshot === null ? 'signedOut' : 'signedIn');
  }, []);

  const expire = useCallback(async () => {
    // CL-2 — the refresh token is refused: local sign-out, purge, back to the sign-in screen.
    setExpiredNotice(sessionExpiredMessage());
    apply(null);
    try {
      await port.signOut();
    } catch {
      // The local session is already gone: an unreachable Auth server changes nothing here.
    }
    await purge();
  }, [apply, port, purge]);

  useEffect(() => {
    // The initial state is already « loading » (EF-1): nothing is written synchronously here.
    const gate = { cancelled: false };

    setRenewalHandler(async () => {
      const renewed = await port.refresh();
      if (renewed === null) return null;
      token.current = renewed.accessToken;
      setSessionToken(renewed.accessToken);
      setUserId(renewed.userId);
      setStatus('signedIn');
      return renewed.accessToken;
    });
    setExpiredHandler(() => {
      void expire();
    });

    const subscription = port.onSnapshot((snapshot) => {
      if (gate.cancelled) return;
      // A refresh event carries the same user: only the token changes.
      apply(snapshot);
    });

    void (async () => {
      try {
        const restored = await port.current();
        if (!gate.cancelled) apply(restored);
      } catch {
        if (!gate.cancelled) apply(null);
      }
    })();

    return () => {
      gate.cancelled = true;
      subscription.unsubscribe();
      setRenewalHandler(null);
      setExpiredHandler(null);
    };
  }, [apply, expire, port]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      setExpiredNotice(null);
      try {
        const snapshot = await port.signInWithPassword(email, password);
        apply(snapshot);
      } catch (cause) {
        setError(messageFor(cause));
        apply(null);
      } finally {
        setBusy(false);
      }
    },
    [apply, port],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    // ADR-3008 § 6 — l'API révoque le jeton de rafraîchissement avant que le client oublie la
    // session (BR-ACC-09) ; une réponse en échec ne bloque jamais la déconnexion locale.
    try {
      await requireApiClient().api.authSignOut({});
    } catch {
      // A local sign-out never depends on the server answer.
    }
    try {
      await port.signOut();
    } catch {
      // ADR-3008 § 6 — a local sign-out never depends on the server answer.
    } finally {
      apply(null);
      await purge();
      setBusy(false);
    }
  }, [apply, port, purge]);

  const accessToken = useCallback(() => token.current, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      userId,
      accessToken,
      signIn,
      signOut,
      expiredNotice,
      error,
      busy,
    }),
    [accessToken, busy, error, expiredNotice, signIn, signOut, status, userId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Session of the application; must be rendered under `SessionProvider` (EF-1). */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession doit être utilisé sous SessionProvider.');
  return value;
}
