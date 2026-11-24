// Sign in with Apple (SPEC-3402 EF-1, EF-2, ET-1; ADR-3008 § 7, ADR-3011).
//
// iOS uses the native authorisation (Apple's guidelines): `AppleAuthenticationButton` for the
// control and `signInAsync` with the SHA-256 hash of a random nonce. Android has no native Apple
// authorisation: the web flow of Supabase runs in the in-app browser and comes back to
// `learny://auth/callback`, where the PKCE code opens the session — the provider then answers with
// a session, exactly like the simulated provider of the e2e builds (ET-3).
import * as AppleAuthentication from 'expo-apple-authentication';
import { getRandomBytes, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '../supabase';

import { createNonce, hashNonce, NONCE_BYTES } from './nonce';
import { providerName, type ProviderAdapter, type ProviderResult } from './types';

/** Redirect allowed in `supabase/config.toml` (SPEC-3101 ET-3); same scheme as the magic link. */
export const APPLE_REDIRECT = 'learny://auth/callback';

async function signInWithAppleNative(): Promise<ProviderResult> {
  const nonce = createNonce(() => getRandomBytes(NONCE_BYTES));
  const hashed = await hashNonce(nonce, (value) =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  );
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashed,
  });
  const idToken = credential.identityToken;
  if (idToken === null || idToken === '') throw new Error('Jeton d’identité Apple absent.');
  return {
    status: 'idToken',
    idToken,
    nonce,
    name: providerName(credential.fullName?.givenName, credential.fullName?.familyName),
  };
}

async function signInWithAppleWeb(): Promise<ProviderResult> {
  const { data, error } = await supabase().auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: APPLE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error !== null) throw error;
  if (data.url === '') throw new Error('URL d’autorisation Apple absente.');

  const browser = await WebBrowser.openAuthSessionAsync(data.url, APPLE_REDIRECT);
  if (browser.type !== 'success') return { status: 'cancelled' };

  const code = new URL(browser.url).searchParams.get('code');
  if (code === null || code === '') return { status: 'cancelled' };
  const exchanged = await supabase().auth.exchangeCodeForSession(code);
  if (exchanged.error !== null) throw exchanged.error;
  return { status: 'session', name: null };
}

export const appleProvider: ProviderAdapter = {
  id: 'apple',

  async isAvailable(): Promise<boolean> {
    // ET-1 — iOS only shows Apple when the platform supports it; Android reaches it by the web
    // flow of Supabase, which has no availability test.
    if (Platform.OS !== 'ios') return true;
    try {
      return await AppleAuthentication.isAvailableAsync();
    } catch {
      return false;
    }
  },

  async signIn(): Promise<ProviderResult> {
    if (Platform.OS === 'ios') return signInWithAppleNative();
    return signInWithAppleWeb();
  },
};
