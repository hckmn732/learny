// Floating action button (SPEC-3002 EF-2): Android only in the mockups (a 56 dp lime square of
// radius 18 above the navigation bar). iOS uses the header action instead.
import { Pressable, StyleSheet } from 'react-native';

import { controls, theme } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';

export interface FabProps {
  readonly icon: IconName;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Floating action button of Android. */
export function Fab({ icon, accessibilityLabel, onPress, testID }: FabProps) {
  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon name={icon} size={24} color={theme.colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: controls.fab,
    height: controls.fab,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.lime,
    ...theme.elevation.float,
  },
});
