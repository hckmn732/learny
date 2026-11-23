// Stack of a tab (SPEC-3102 EF-1): every tab owns its pile, so a course, a quiz or a fiche can be
// pushed above the tab without leaving it. The screens of the pile arrive with SPEC-3201 and on.
import { Stack } from 'expo-router';

import { theme } from '../theme';

/** Pile of one tab. */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    />
  );
}
