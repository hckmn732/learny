// Group of the connected screens (SPEC-3101 EF-7; the tabs arrive with SPEC-3102).
import { Stack } from 'expo-router';

import { theme } from '../../src/theme';

export default function AppGroupLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }}
    />
  );
}
