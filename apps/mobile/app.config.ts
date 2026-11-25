// Expo configuration (SPEC-3001 ET-5, ET-6). Evaluated by the Expo CLI at build time: the six
// `EXPO_PUBLIC_*` variables are required and validated with the same Zod schema as the
// application (`src/config.ts`). A missing or malformed value stops the build with an explicit
// message that lists the *keys* only — a value never appears in a log or in the manifest.
//
// SPEC-3502 — publication : identifiants définitifs, permissions déclarées, manifeste de
// confidentialité iOS (`ios.privacyManifests` → `PrivacyInfo.xcprivacy` par `expo prebuild`, ET-3),
// aucune API de suivi, aucun réglage de test. Le profil `production` d'`eas.json` ne pose aucune
// variable de démonstration : `extra.enableSddPages` y vaut donc `false`.
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { formatConfigError, parseConfig, readPublicEnv } from './src/config.ts';

/**
 * Canvas colour of the mockups (`colors.canvas` of `@learny/ui/tokens`). It is repeated here
 * because this file runs in the Expo config loader — pure Node — where the TypeScript sources of
 * the token package are not resolvable; `apps/mobile/src/theme` is the runtime source of truth and
 * the token check of the visual flow compares this value with it.
 */
const CANVAS = '#F4F4F1';

/**
 * Lime of the brand tile (`colors.lime` of `@learny/ui/tokens`): background of the adaptive icon
 * behind the ink « M » mark of the mockup (`logo` of `src/ui/icons.tsx`), as in the app header.
 */
const BRAND_LIME = '#C6F432';

/**
 * API à raison requise du manifeste de confidentialité iOS (SPEC-3502 ET-3, BR-PLA-05). La même
 * liste est publiée par `store/metadata.ts` (`REQUIRED_REASON_APIS`) et la fiche de confidentialité
 * `store/privacy/app-store.md` ; `test/integration/release-config.int.test.ts` vérifie que les trois
 * restent d'accord. Aucun suivi (`NSPrivacyTracking: false`), aucun domaine de suivi.
 */
const REQUIRED_REASON_APIS = [
  {
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
    NSPrivacyAccessedAPITypeReasons: ['C617.1'],
  },
  {
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
    NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
  },
  {
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
    NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
  },
  {
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
    NSPrivacyAccessedAPITypeReasons: ['E174.1'],
  },
];

/**
 * Données collectées déclarées à Apple (BR-PLA-05, ET-3). Elles décrivent exactement le registre
 * des traitements (SPEC-806) : coordonnées, contenu utilisateur, activité, jeton de notification.
 * Aucune n'est liée au suivi publicitaire.
 */
const COLLECTED_DATA_TYPES = [
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeProductInteraction',
  'NSPrivacyCollectedDataTypeDeviceID',
].map((NSPrivacyCollectedDataType) => ({
  NSPrivacyCollectedDataType,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  // Finalité unique : le fonctionnement de l'application. Aucune finalité « analytics » ni
  // « publicité » (ET-4 : pas de télémétrie, Sentry n'est pas configuré).
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
}));

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
      // Publication : l'application n'utilise que le chiffrement fourni par le système (HTTPS,
      // Keychain). La déclaration évite une question bloquante à chaque revue (SPEC-3502 EF-4).
      ITSAppUsesNonExemptEncryption: false,
      // SPEC-4003 ET-3, CA-2 — « Ouvrir avec Learny » : les types de documents que l'application
      // accepte et qui ouvrent le dépôt avec le fichier déjà ajouté.
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Document de cours',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: [
            'com.adobe.pdf',
            'org.openxmlformats.wordprocessingml.document',
            'public.plain-text',
            'public.image',
          ],
        },
      ],
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'org.openxmlformats.wordprocessingml.document',
          UTTypeDescription: 'Document Word',
          UTTypeConformsTo: ['public.data', 'public.composite-content'],
          UTTypeTagSpecification: {
            'public.filename-extension': ['docx'],
            'public.mime-type': [
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ],
          },
        },
      ],
      NSCameraUsageDescription:
        'Prendre en photo les pages de ton cours pour en faire une formation.',
      NSPhotoLibraryUsageDescription:
        'Choisir les photos de pages de ton cours pour en faire une formation.',
    },
    // SPEC-3502 ET-3, BR-PLA-05 — manifeste de confidentialité (`PrivacyInfo.xcprivacy`) : API à
    // raison requise et données collectées, aucune collecte publicitaire ni de suivi.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: REQUIRED_REASON_APIS,
      NSPrivacyCollectedDataTypes: COLLECTED_DATA_TYPES,
    },
  },
  android: {
    package: 'fr.learny.app',
    // SPEC-3502 EF-4 — permissions réellement utilisées, déclarées explicitement pour la fiche
    // Google Play (ET-3) : réseau, notifications de rappel, vibration du canal « Rappels Learny ».
    // Aucune permission de localisation, de contacts, de caméra ni de journal d'appels.
    permissions: [
      'android.permission.INTERNET',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.CAMERA',
    ],
    // SPEC-3101 ET-3, EF-6 — App Links verified on the two paths a link can land on: the
    // static page `/auth/mobile` and the callback of the API carried by the e-mails.
    // SPEC-4003 ET-3, CA-2 — « Partager vers Learny » : ACTION_SEND et ACTION_SEND_MULTIPLE pour
    // un PDF, un DOCX ou une image. L'application reçoit l'URI du document et ouvre le dépôt.
    intentFilters: [
      ...(linkHost === null
        ? []
        : [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [
                { scheme: 'https', host: linkHost, pathPrefix: '/auth/mobile' },
                { scheme: 'https', host: linkHost, pathPrefix: '/api/v1/auth/callback' },
              ],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ]),
      // « Ouvrir avec Learny » depuis un gestionnaire de fichiers : le même dépôt, sans partage.
      {
        action: 'VIEW',
        category: ['DEFAULT', 'BROWSABLE'],
        data: [
          { scheme: 'file', mimeType: 'application/pdf' },
          { scheme: 'content', mimeType: 'application/pdf' },
          {
            scheme: 'file',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          { scheme: 'content', mimeType: 'image/*' },
        ],
      },
      {
        action: 'SEND',
        category: ['DEFAULT'],
        data: [
          { mimeType: 'application/pdf' },
          {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          { mimeType: 'image/*' },
        ],
      },
      {
        action: 'SEND_MULTIPLE',
        category: ['DEFAULT'],
        data: [
          { mimeType: 'application/pdf' },
          {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          { mimeType: 'image/*' },
        ],
      },
    ],
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: BRAND_LIME,
    },
  },
  plugins: [
    'expo-router',
    // Launch screen: the Learny mark on the canvas of the mockups (never the Expo placeholder).
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 112,
        resizeMode: 'contain',
        backgroundColor: CANVAS,
      },
    ],
    // ADR-3018 — HTTP local de l'émulateur (10.0.2.2) autorisé dans les seuls builds e2e.
    './plugins/with-e2e-cleartext.cjs',
    // SPEC-3003 ET-1 — the encryption key of the session cache lives in the platform keychain:
    // the plugin keeps it out of the Android backups (`allowBackup` rules).
    'expo-secure-store',
    // SPEC-4003 ET-3 — sélecteurs natifs et partage.
    'expo-sharing',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choisir les photos de pages de ton cours pour en faire une formation.',
        cameraPermission: 'Prendre en photo les pages de ton cours pour en faire une formation.',
      },
    ],
    'expo-document-picker',
    '@react-native-community/datetimepicker',
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
    // server secret (ADR-3004 § 1). `false` in a production build (eas.json, SPEC-3502 EF-4).
    enableSddPages: sddPages,
  },
});
