// Root layout (SPEC-3001 § 8.3, SPEC-3002 ET-3): providers, theme, embedded fonts and the
// configuration guard. The splash screen stays until the fonts are loaded; a failed load falls
// back to the system fonts instead of blocking the start-up.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
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
import { configResult } from '../src/config';
import { ConfigErrorPage } from '../src/features/sdd/ConfigErrorPage';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);

  useEffect(() => {
    if (fontsLoaded || fontError !== null) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

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
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.canvas },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
