// Root layout (SPEC-3001 § 8.3): providers, theme, fonts, and the configuration guard.
// The configuration is validated once, at start-up; an invalid configuration shows the
// « Configuration invalide » screen instead of a crash (CL-2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import interMedium from '../assets/fonts/Inter-Medium.ttf';
import interRegular from '../assets/fonts/Inter-Regular.ttf';
import interSemiBold from '../assets/fonts/Inter-SemiBold.ttf';
import spaceGroteskBold from '../assets/fonts/SpaceGrotesk-Bold.ttf';
import spaceGroteskMedium from '../assets/fonts/SpaceGrotesk-Medium.ttf';
import { configResult } from '../src/config';
import { ConfigErrorPage } from '../src/features/sdd/ConfigErrorPage';
import { theme } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0 },
  },
});

export default function RootLayout() {
  // The fonts are also embedded natively by the expo-font plugin; loading them here keeps the
  // development client and the tests on the same code path. Rendering never waits for them.
  useFonts({
    'SpaceGrotesk-Bold': spaceGroteskBold,
    'SpaceGrotesk-Medium': spaceGroteskMedium,
    'Inter-Regular': interRegular,
    'Inter-Medium': interMedium,
    'Inter-SemiBold': interSemiBold,
  });

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
