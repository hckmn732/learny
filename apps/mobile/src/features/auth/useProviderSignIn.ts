// Provider connection of the sign-in screen (SPEC-3402 EF-1 to EF-6, ET-1, CL-1 to CL-4; BR-ACC-02).
//
// The hook owns the whole sequence and keeps the screen free of platform code:
//   1. the provider opens its window (double press refused, CL-4);
//   2. its result opens the session — identity token for Supabase, or a session already opened by
//      the Apple web flow (ET-1);
//   3. a first connection must accept the legal documents before the shell opens (BR-ACC-02): the
//      active versions only come from a refusal, so the hook probes them once per account and
//      holds the navigation gate until the sheet is accepted;
//   4. the name announced by the provider fills the empty fields of the profile (EF-2).
import { useCallback, useEffect, useRef, useState } from 'react';

import { fr } from '@learny/i18n';

import { requireApiClient } from '../../api/registry';
import type { LegalVersions } from '../../auth/legal';
import { hasLegalAcceptance, rememberLegalAcceptance } from '../../auth/legal-cache';
import { MOBILE_LEGAL_VERSIONS } from '../../auth/legal-versions';
import { holdNavigation, releaseNavigation } from '../../auth/navigation-hold';
import {
  applyProviderName,
  currentProviderSession,
  signInWithProviderToken,
  type ProviderAccessApi,
  type ProviderAuthClient,
  type ProviderSession,
} from '../../auth/provider-access';
import { isMockProviderEnabled, providerFor } from '../../auth/providers';
import { providerFailureOf } from '../../auth/providers/errors';
import type { ProviderId, ProviderName } from '../../auth/providers/types';
import { secureSessionStorage } from '../../auth/secure-backend';
import { supabase } from '../../auth/supabase';

export interface ProviderSignIn {
  readonly busy: ProviderId | null;
  /** Versions waiting for the acceptance; `null` when the sheet is closed (CA-2). */
  readonly legalVersions: LegalVersions | null;
  readonly error: string | null;
  /** Starts the connection; a cancellation stays silent (EF-5). */
  signIn(provider: ProviderId): Promise<void>;
  /** Acceptance recorded: releases the gate and applies the provider name. */
  legalAccepted(): Promise<void>;
  /** « Plus tard »: the connection is abandoned, nothing is opened (BR-ACC-02). */
  legalDismissed(): void;
}

/** API calls of the follow-up, bound to the client of the process. */
function accessApi(): ProviderAccessApi {
  const client = requireApiClient();
  return {
    me: async () => {
      const me = await client.api.meGet({});
      return { firstName: me.firstName, lastName: me.lastName };
    },
    updateProfile: async (body) => {
      await client.api.meUpdate({ body });
    },
  };
}

/** Supabase Auth seen through the narrow surface of `provider-access.ts`. */
function authClient(): ProviderAuthClient {
  return supabase().auth;
}

export function useProviderSignIn(): ProviderSignIn {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [legalVersions, setLegalVersions] = useState<LegalVersions | null>(null);
  const [error, setError] = useState<string | null>(null);
  // CL-4 — a ref guards the double press: the second press of the same frame still sees `busy`.
  const inFlight = useRef(false);
  const session = useRef<ProviderSession | null>(null);
  const name = useRef<ProviderName | null>(null);

  const finish = useCallback(async (): Promise<void> => {
    try {
      await applyProviderName(accessApi(), name.current);
    } catch {
      // EF-2 — the name is a comfort: a refusal never blocks the access already granted.
    }
    releaseNavigation();
  }, []);

  useEffect(() => {
    // A screen left while the gate was held must never freeze the next connection.
    return () => {
      releaseNavigation();
    };
  }, []);

  const signIn = useCallback(
    async (provider: ProviderId): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setBusy(provider);
      holdNavigation();
      try {
        const result = await providerFor(provider).signIn();
        if (result.status === 'cancelled') {
          releaseNavigation();
          return;
        }
        const established =
          result.status === 'idToken'
            ? await signInWithProviderToken(authClient(), provider, result)
            : await currentProviderSession(authClient());
        session.current = established;
        name.current = result.name;

        if (!(await hasLegalAcceptance(secureSessionStorage, established.userId))) {
          // CA-2 — the gate stays held until the sheet is accepted. The versions are the ones of
          // this release (ADR-3024); the server validates the pair when it is recorded.
          setLegalVersions(MOBILE_LEGAL_VERSIONS);
          return;
        }
        await finish();
      } catch (cause) {
        const failure = providerFailureOf(cause);
        if (failure.kind === 'cancelled') {
          releaseNavigation();
          return;
        }
        // CL-2 — the provider code is logged, never the token, the nonce or the e-mail.
        console.warn(`[SPEC-3402] connexion fournisseur refusée : ${failure.code ?? 'sans code'}`);
        setError(failure.message);
        releaseNavigation();
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [finish],
  );

  const legalAccepted = useCallback(async (): Promise<void> => {
    const established = session.current;
    if (established !== null) {
      await rememberLegalAcceptance(secureSessionStorage, established.userId);
    }
    setLegalVersions(null);
    await finish();
  }, [finish]);

  const legalDismissed = useCallback((): void => {
    // BR-ACC-02 — without the acceptance the connection is not kept: local sign-out, no access.
    setLegalVersions(null);
    void (async () => {
      try {
        await supabase().auth.signOut({ scope: 'local' });
      } catch {
        // A local sign-out never depends on the server answer (ADR-3008 § 6).
      }
      releaseNavigation();
      setError(fr.mobile.auth.providers.legalRequired);
    })();
  }, []);

  return { busy, legalVersions, error, signIn, legalAccepted, legalDismissed };
}

/** The e2e build replaces the providers: the screen exposes it for its tests only. */
export const PROVIDER_MOCK_ENABLED = isMockProviderEnabled;
