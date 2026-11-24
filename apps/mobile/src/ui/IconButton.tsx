// Icon button (SPEC-3002 EF-2, ET-6): `accessibilityLabel` is a required prop, so an icon alone
// can never be silent (CL-4, BR-PLA-03). It keeps the platform minimum touch target.
import { Pressable, StyleSheet, View } from 'react-native';

import { theme, verticalHitSlop } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';

export interface IconButtonProps {
  readonly name: IconName;
  /** Mandatory: an icon button has no readable text (ET-6, CL-4). */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly variant?: 'surface' | 'plain';
  /** Orange dot of the unread notifications. */
  readonly dot?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** Square (iOS) or round (Android) button that holds a single icon. */
export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  dot = false,
  disabled = false,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{
        top: verticalHitSlop(theme.minTouchTarget.height),
        bottom: verticalHitSlop(theme.minTouchTarget.height),
      }}
      style={({ pressed }) => [
        styles.base,
        variant === 'plain' ? styles.plain : styles.surface,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Icon name={name} size={20} color={theme.colors.ink} />
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: theme.minTouchTarget.width,
    height: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.iconButton,
  },
  surface: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  plain: { backgroundColor: 'transparent' },
  dot: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
  },
});
