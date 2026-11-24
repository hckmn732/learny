// Expo configuration (SPEC-3001 ET-5, ET-6). Evaluated by the Expo CLI at build time: the six
// `EXPO_PUBLIC_*` variables are required and validated with the same Zod schema as the
// application (`src/config.ts`). A missing or malformed value stops the build with an explicit
// message that lists the *keys* only — a value never appears in a log or in the manifest.
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { formatConfigError, parseConfig, readPublicEnv } from './src/config.ts';

/**
 * Canvas colour of the mockups (`colors.canvas` of `@learny/ui/tokens`). It is repeated here
 * because this file runs in the Expo config loader — pure Node — where the TypeScript sources of
 * the token package are not resolvable; `apps/mobile/src/theme` is the runtime source of truth and
 * the token check of the visual flow compares this value with it.
 */
const CANVAS = '#F4F4F1';

const parsed = parseConfig(readPublicEnv());

if (!parsed.ok) {
  // Fail fast: a build with an incomplete configuration produces an application that cannot
  // reach the API (CL-2). The runtime also refuses to start and shows « Configuration invalide ».
  throw new Error(`Configuration mobile invalide.\n${formatConfigError(parsed)}`);
}

/**
 * Host of the web application, used by the universal links (SPEC-3101 ET-3). A loopback
 * host cannot be verified by the platform, so no filter is declared for it.
 */
const webUrl = parsed.config.webUrl;

function universalLinkHost(url: string): string | null {
  try {
    const { host } = new URL(url);
    if (host === '' || host.startsWith('localhost') || host.startsWith('127.0.0.1')) return null;
    return host;
  } catch {
    return null;
  }
}

const linkHost = universalLinkHost(webUrl);

const sddPages = parsed.config.enableSddPages;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Learny',
  slug: 'learny',
  version: '1.0.0',
  scheme: 'learny',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // The new architecture and Hermes are the only ones of React Native 0.88 (ADR-3004 § 1): Expo
  // SDK 58 has no `newArchEnabled` nor `jsEngine` flag any more, both are always on.
  // EAS Update: the runtime version follows the native fingerprint (ADR-3004 § 8).
  runtimeVersion: { policy: 'fingerprint' },
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'fr.learny.app',
    // SPEC-3402 ET-2 — « Sign in with Apple » is enabled on the identifier (entitlement), and the
    // native button of `expo-apple-authentication` is used on iOS (EF-1).
    usesAppleSignIn: true,
    // SPEC-3101 ET-3 — the universal link of the web application, served by
    // `apps/web/public/.well-known/apple-app-site-association`.
    associatedDomains: linkHost === null ? [] : [`applinks:${linkHost}`],
    supportsTablet: false,
    infoPlist: {
      // The demo page talks to the local API of the development stack (ADR-3004 § 7).
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: 'fr.learny.app',
    // SPEC-3101 ET-3, EF-6 — App Links verified on the two paths a link can land on: the
    // static page `/auth/mobile` and the callback of the API carried by the e-mails.
    ...(linkHost === null
      ? {}
      : {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [
                { scheme: 'https', host: linkHost, pathPrefix: '/auth/mobile' },
                { scheme: 'https', host: linkHost, pathPrefix: '/api/v1/auth/callback' },
              ],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }),
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: CANVAS,
    },
  },
  plugins: [
    'expo-router',
    // ADR-3018 — HTTP local de l'émulateur (10.0.2.2) autorisé dans les seuls builds e2e.
    './plugins/with-e2e-cleartext.cjs',
    // SPEC-3003 ET-1 — the encryption key of the session cache lives in the platform keychain:
    // the plugin keeps it out of the Android backups (`allowBackup` rules).
    'expo-secure-store',
    // SPEC-3501 EF-7, ADR-3007 — native notifications (FCM and APNs). The Android channel
    // « Rappels Learny » (high importance) and its monochrome icon are created at runtime by
    // `src/notifications/expo-device.ts`; iOS keeps the default sound and declares no badge (V1).
    [
      'expo-notifications',
      {
        icon: './assets/android-icon-foreground.png',
        color: CANVAS,
        defaultChannel: 'learny-reminders',
        sounds: [],
        enableBackgroundRemoteNotifications: false,
      },
    ],
    // SPEC-3402 ET-2 — Google Sign-In native. The identifiers are public and come from the
    // porteur; the iOS URL scheme has the shape Google requires even before the real client
    // exists, so a build never fails on a missing development credential. No secret is involved.
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME as string | undefined) ??
          'com.googleusercontent.apps.unconfigured-learndev',
      },
    ],
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/SpaceGrotesk-Bold.ttf',
          './assets/fonts/SpaceGrotesk-Medium.ttf',
          './assets/fonts/Inter-Regular.ttf',
          './assets/fonts/Inter-Medium.ttf',
          './assets/fonts/Inter-SemiBold.ttf',
          './assets/fonts/Inter-Bold.ttf',
          './assets/fonts/SpaceGrotesk-SemiBold.ttf',
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Read by `src/config.ts` at runtime only when the build did not inline the values; never a
    // server secret (ADR-3004 § 1).
    enableSddPages: sddPages,
  },
});
