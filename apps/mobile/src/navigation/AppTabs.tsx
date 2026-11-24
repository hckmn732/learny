// Native destinations of the shell (SPEC-3102 EF-1, ET-1; ADR-3004 § 2).
//
// `AppTabs` is the only module that knows how the five destinations are rendered: a navigator of
// `Tabs` (the JavaScript tabs of Expo Router) whose bar is `AppTabBar`. The screens never import
// it, so swapping the navigator — the escape hatch of ET-1 — never touches them.
//
// The choice of ET-1 is recorded in § 15 of the specification: the native tabs of
// `expo-router/native-tabs` would need the `expo-symbols` package for their Android icons (a new
// dependency, ADR-3004) and their `testID` is not readable by Maestro on Android — two reasons
// the escape hatch of ET-1 covers. The initial tab and the back behaviour come from
// `unstable_settings` of `app/(app)/_layout.tsx`.
import { Tabs } from 'expo-router/js-tabs';

import { theme } from '../theme';

import { AppTabBar } from './AppTabBar';
import { TABS } from './tabs';

/** Five tabs, one pile each, `Aujourd'hui` first. */
export function AppTabs() {
  return (
    <Tabs
      // CL-5 — the system back on the root of another tab comes back to Aujourd'hui.
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.canvas },
      }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
