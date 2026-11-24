// Tab bar of the shell (SPEC-3102 EF-1, CA-1; BR-PLA-02, ET-5).
//
// Bar drawn from the theme instead of the platform default: the exact labels of the mockup, the
// five icons of the design system, the platform look (ink icon and label on iOS, Material pill
// on Android), a 48 dp target and the announced state of each tab. Presentation only: the
// navigator selects a tab (`navigateToTab`), and a press on the active tab pops its pile
// (`POP_TO_TOP` on the key of the nested stack) — EF-1.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme, verticalHitSlop } from '../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

import { tabOfRoute } from './tabs';

/** Route of the bar, with the key of the nested pile the runtime keeps on it. */
interface ShellTabRoute {
  readonly key: string;
  readonly name: string;
  readonly state?: { readonly key: string } | undefined;
}

/** Props really handed to a custom tab bar by the navigator of Expo Router. */
export interface AppTabBarProps {
  readonly state: { readonly index: number; readonly routes: readonly ShellTabRoute[] };
  readonly descriptors: BottomTabBarProps['descriptors'];
  readonly emitter: BottomTabBarProps['emitter'];
  readonly navigateToTab: (routeKey: string) => void;
}

/** `POP_TO_TOP` of the pile of a tab (EF-1). */
export function reselectTab(
  navigation: {
    dispatch: (action: { readonly type: string; readonly target?: string }) => void;
  },
  nestedKey: string | undefined,
): void {
  navigation.dispatch({
    type: 'POP_TO_TOP',
    ...(nestedKey === undefined ? {} : { target: nestedKey }),
  });
}

/** Bottom bar of the five tabs. */
export function AppTabBar({ state, descriptors, emitter, navigateToTab }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name ?? '';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Navigation principale"
      testID="app-tab-bar"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}
    >
      {state.routes.map((route, index) => {
        const tab = tabOfRoute(route.name);
        if (tab === null) return null;
        const focused = state.index === index;
        const descriptor = descriptors[route.key];

        const press = (): void => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (focused) {
            // EF-1 — a press on the active tab returns to the root of its pile.
            if (descriptor !== undefined) {
              reselectTab(descriptor.navigation, route.state?.key);
            }
            return;
          }
          if (!event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <Pressable
            key={route.key}
            testID={tab.testID}
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityState={{ selected: focused && activeName !== '' }}
            onPress={press}
            hitSlop={{ top: verticalHitSlop(theme.touchTarget.height) }}
            style={styles.item}
          >
            <View style={[styles.icon, focused ? styles.iconActive : null]}>
              <Icon
                name={tab.icon}
                size={20}
                color={focused ? theme.colors.ink : theme.colors.inkMuted}
              />
            </View>
            <Text variant="chip" tone={focused ? 'primary' : 'muted'} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.sm,
  },
  item: {
    flex: 1,
    minHeight: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  icon: {
    height: 28,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  iconActive: {
    backgroundColor: theme.platform === 'android' ? theme.colors.limeSoft : 'transparent',
  },
});
