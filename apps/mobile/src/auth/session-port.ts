// Port of the session (SPEC-3003 EF-1, EF-3; ADR-3008 § 1 à § 3, § 6).
//
// `session.tsx` only knows this interface: the Supabase implementation lives here, and the tests
// inject a fake port instead of a native Auth client. A snapshot never carries more than what the
// screens and the API client need: the user id, the access token and the e-mail.
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export interface SessionSnapshot {
  readonly userId: string;
  readonly accessToken: string | null;
  readonly email: string | null;
}

export interface SessionSubscription {
  unsubscribe(): void;
}

export interface SessionPort {
  /** Session restored from the encrypted storage, or `null` (CL-4). */
  current(): Promise<SessionSnapshot | null>;
  /** Listen to sign-in, sign-out and token refresh events of the Auth client. */
  onSnapshot(listener: (snapshot: SessionSnapshot | null) => void): SessionSubscription;
  /** Renews the session once (`refreshSession`); `null` when the refresh token is refused (CL-2). */
  refresh(): Promise<SessionSnapshot | null>;
  signInWithPassword(email: string, password: string): Promise<SessionSnapshot>;
  /** Local sign-out: the server revokes the refresh token, the client forgets the session. */
  signOut(): Promise<void>;
}

/** Maps a Supabase session to the snapshot of the port; never exposes a token in a message. */
export function snapshotOf(session: Session | null): SessionSnapshot | null {
  if (session === null) return null;
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    email: session.user.email ?? null,
  };
}

/** Implementation bound to Supabase Auth (EF-1). */
export const supabaseSessionPort: SessionPort = {
  current() {
    return supabase()
      .auth.getSession()
      .then(({ data, error }) => (error === null ? snapshotOf(data.session) : null));
  },

  onSnapshot(listener) {
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      listener(snapshotOf(session));
    });
    return {
      unsubscribe: () => {
        data.subscription.unsubscribe();
      },
    };
  },

  refresh() {
    return supabase()
      .auth.refreshSession()
      .then(({ data, error }) => (error === null ? snapshotOf(data.session) : null));
  },

  signInWithPassword(email, password) {
    return supabase()
      .auth.signInWithPassword({ email, password })
      .then(({ data, error }) => {
        if (error !== null) throw new Error(error.message);
        const snapshot = snapshotOf(data.session);
        if (snapshot === null) throw new Error('Session absente après la connexion.');
        return snapshot;
      });
  },

  async signOut() {
    // ADR-3008 § 6 — the local session is dropped even when the Auth server is unreachable.
    const { error } = await supabase().auth.signOut({ scope: 'local' });
    if (error !== null) throw new Error(error.message);
  },
};
