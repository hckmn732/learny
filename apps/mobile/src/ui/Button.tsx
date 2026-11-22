// Button (SPEC-3002 EF-2, ET-6, CL-2): four variants, two sizes, a loading state that can be
// pressed only once, and the platform minimum touch target even when the mockup draws a
// smaller control (CA-3, BR-PLA-02).
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { confirmationFeedback } from '../lib/haptics';
import { controls, radius, theme, touchTarget, verticalHitSlop } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'ink' | 'outline' | 'text';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** A busy button announces itself and refuses a second press (CL-2). */
  readonly loading?: boolean;
  readonly disabled?: boolean;
  /** Full width of its container. */
  readonly block?: boolean;
  readonly icon?: IconName;
  readonly testID?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
}

const SURFACE: Record<ButtonVariant, { background: string; border: string; label: string }> = {
  primary: { background: theme.colors.lime, border: theme.colors.lime, label: 'primary' },
  ink: { background: theme.colors.ink, border: theme.colors.ink, label: 'inverse' },
  outline: {
    background: theme.colors.surface,
    border: theme.colors.borderStrong,
    label: 'primary',
  },
  text: { background: 'transparent', border: 'transparent', label: 'primary' },
};

/** Action button of the application. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  block = false,
  icon,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const surface = SURFACE[variant];
  const height = controls.button[size];

  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        if (inactive) return;
        if (variant === 'primary') confirmationFeedback();
        onPress();
      }}
      hitSlop={verticalHitSlop(height)}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: surface.background,
          borderColor: surface.border,
          opacity: inactive ? 0.45 : pressed ? 0.85 : 1,
        },
        size === 'md' ? styles.md : styles.sm,
        block ? styles.block : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.ink} testID="button-spinner" />
        ) : icon === undefined ? null : (
          <Icon
            name={icon}
            size={18}
            color={variant === 'ink' ? theme.colors.white : theme.colors.ink}
          />
        )}
        <Text
          variant={size === 'md' ? 'button' : 'buttonSmall'}
          tone={variant === 'ink' ? 'inverse' : 'primary'}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  md: { paddingHorizontal: theme.spacing.xl },
  sm: { paddingHorizontal: theme.spacing.lg },
  block: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});

/** The minimum target a button must offer; exported for the tests of CA-3. */
export const BUTTON_MIN_HEIGHT = touchTarget.height;
