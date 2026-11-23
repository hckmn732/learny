// Google Sign-In of the mobile application (SPEC-3402 EF-3, ET-1; ADR-3008 § 7, ADR-3011).
//
// The native SDK opens its own window, on Android and iOS alike; the identity token it returns is
// exchanged by Supabase, never stored (BR-PLA-05). The client identifiers are public
// (`EXPO_PUBLIC_*`) and arrive from the porteur; without them the exchange is refused and CL-2
// applies.
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { providerName, type ProviderAdapter, type ProviderResult } from './types';

let configured = false;

/** Configures the SDK once per process with the public identifiers of the build. */
function configure(): void {
  if (configured) return;
  const webClientId = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as string | undefined) ?? '';
  const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID as string | undefined) ?? '';
  GoogleSignin.configure({
    scopes: ['email', 'profile'],
    ...(webClientId === '' ? {} : { webClientId }),
    ...(iosClientId === '' ? {} : { iosClientId }),
  });
  configured = true;
}

export const googleProvider: ProviderAdapter = {
  id: 'google',

  // The native module is always present: a missing identifier is a CL-2 refusal at press time,
  // not a hidden button (CA-1 requires both providers).
  isAvailable(): Promise<boolean> {
    configure();
    return Promise.resolve(true);
  },

  async signIn(): Promise<ProviderResult> {
    configure();
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    }
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response) || !isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }
    const idToken = response.data.idToken;
    if (idToken === null || idToken === '') throw new Error('Jeton d’identité Google absent.');
    return {
      status: 'idToken',
      idToken,
      nonce: null,
      name: providerName(response.data.user.givenName, response.data.user.familyName),
    };
  },
};
