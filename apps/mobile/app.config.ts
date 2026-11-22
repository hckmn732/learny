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
    supportsTablet: false,
    infoPlist: {
      // The demo page talks to the local API of the development stack (ADR-3004 § 7).
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: 'fr.learny.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: CANVAS,
    },
  },
  plugins: [
    'expo-router',
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
