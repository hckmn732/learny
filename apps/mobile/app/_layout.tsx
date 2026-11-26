// Root layout (SPEC-3001 § 8.3, SPEC-3002 ET-3, SPEC-3003 EF-1/EF-4/EF-5): providers, theme,
// embedded fonts and the configuration guard. The splash screen stays until the fonts are loaded;
// a failed load falls back to the system fonts instead of blocking the start-up.
//
// Order of the providers (SPEC-3003 § 8): the session first (it publishes the token, EF-1), then
// the query cache (keyed by the signed-in account, EF-4), then the safe area and the screens.
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import interBold from '../assets/fonts/Inter-Bold.ttf';
import interMedium from '../assets/fonts/Inter-Medium.ttf';
import interRegular from '../assets/fonts/Inter-Regular.ttf';
import interSemiBold from '../assets/fonts/Inter-SemiBold.ttf';
import spaceGroteskBold from '../assets/fonts/SpaceGrotesk-Bold.ttf';
import spaceGroteskMedium from '../assets/fonts/SpaceGrotesk-Medium.ttf';
import spaceGroteskSemiBold from '../assets/fonts/SpaceGrotesk-SemiBold.ttf';
// Installs the API client of the process before any screen renders (SPEC-3003 EF-2).
import '../src/api/instance';
// Installs the browser of the web hand-offs before any screen renders (SPEC-3102 EF-5).
import '../src/lib/web-browser';
import { SessionProvider } from '../src/auth/session';
import { supabaseSessionPort } from '../src/auth/session-port';
import { configResult } from '../src/config';
import { AppQueryProvider } from '../src/data/providers';
import { appQueryClient } from '../src/data/query-client';
import { AuthGate } from '../src/features/auth/AuthGate';
import { ConfigErrorPage } from '../src/features/sdd/ConfigErrorPage';
import { ApiErrorToast } from '../src/features/shell/ApiErrorToast';
import { AppErrorScreen } from '../src/features/shell/AppErrorScreen';
import { PushBridge } from '../src/notifications/PushBridge';
import { startOfflineWiring } from '../src/offline/network-wiring';
import { ShareIntake } from '../src/simple/share-intake';
import { theme } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

/** The seven weights of the design system (SPEC-3002 § 3); a family carries its weight. */
const FONTS = {
  'SpaceGrotesk-Medium': spaceGroteskMedium,
  'SpaceGrotesk-SemiBold': spaceGroteskSemiBold,
  'SpaceGrotesk-Bold': spaceGroteskBold,
  'Inter-Regular': interRegular,
  'Inter-Medium': interMedium,
  'Inter-SemiBold': interSemiBold,
  'Inter-Bold': interBold,
} as const;

/** Version of the application: the schema version of the persisted cache (SPEC-3003 EF-4). */
function appVersion(): string {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version !== '' ? version : '0.0.0';
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);

  useEffect(() => {
    if (fontsLoaded || fontError !== null) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  // Network and foreground wiring (SPEC-3003 EF-4, EF-5): one subscription for the whole process.
  useEffect(() => {
    const wiring = startOfflineWiring(appQueryClient);
    return () => {
      wiring.stop();
    };
  }, []);

  // Nothing renders before the fonts (or their failure): the system fonts then take over (ET-3).
  if (!fontsLoaded && fontError === null) return null;

  if (!configResult.ok) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ConfigErrorPage missing={configResult.missing} invalid={configResult.invalid} />
      </SafeAreaProvider>
    );
  }

  return (
    <SessionProvider port={supabaseSessionPort}>
      {/* SPEC-3101 EF-7 — garde : coquille fermée hors session, connexion quittée une fois
          la session ouverte. Les pages /_dev des builds de test restent hors garde. */}
      <AuthGate />
      <AppQueryProvider appVersion={appVersion()}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          {/* SPEC-3102 EF-6 — the offline band of SPEC-3003 now lives in the shell; the stack
              declares the two modal sheets of the header (EF-3, EF-4). */}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.canvas },
            }}
          >
            <Stack.Screen
              name="notifications"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="compte"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="tuteur"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            {/* SPEC-3304 EF-1, ET-4 — plein écran sans onglets ; le geste de retour iOS est
                désactivé pour que la sortie passe par la confirmation d'EF-5. */}
            <Stack.Screen
              name="quiz"
              options={{ gestureEnabled: false, animation: 'slide_from_right' }}
            />
          </Stack>
          {/* SPEC-3501 EF-2 — toucher d'une notification et bannière interne du premier plan. */}
          <PushBridge />
          {/* SPEC-4003 EF-3 — partage entrant, avant ou après la connexion. */}
          <ShareIntake />
          {/* QA 2026-11-26 — toute action en échec affiche sa cause. */}
          <ApiErrorToast />
        </SafeAreaProvider>
      </AppQueryProvider>
    </SessionProvider>
  );
}

/**
 * Global boundary of the application (SPEC-3102 EF-6): a screen that throws shows
 * « Une erreur inattendue est survenue » with « Relancer » instead of a blank page.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <AppErrorScreen
      error={props.error}
      retry={() => {
        void props.retry();
      }}
    />
  );
}
