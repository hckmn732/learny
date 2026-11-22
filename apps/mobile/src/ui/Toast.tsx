// Toast (SPEC-3002 EF-2): dark pill of radius 14 with a lime dot, announced as an alert and
// dismissed after the design-system duration (5 s, 8 s with an action).
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { radius, theme } from '../theme';

import { useEnterStyle } from './motion';
import { Text } from './Text';

/**
 * Duration of a toast, in milliseconds: the design-system value, or its longer variant when
 * the toast carries an action (the user needs time to reach it).
 */
export function toastDuration(actionLabel?: string): number {
  return actionLabel === undefined ? theme.durations.toast : theme.durations.toastAction;
}

export interface ToastProps {
  readonly visible: boolean;
  readonly message: string;
  readonly onHide?: () => void;
  /** Overrides the design-system duration, in milliseconds. */
  readonly duration?: number;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}

/** Transient confirmation at the bottom of the screen. */
export function Toast({
  visible,
  message,
  onHide,
  duration,
  actionLabel,
  onAction,
  testID,
}: ToastProps) {
  const animated = useEnterStyle(theme.durations.fast, 8);

  useEffect(() => {
    if (!visible) return;
    const milliseconds = duration ?? toastDuration(actionLabel);
    const timer = setTimeout(() => {
      onHide?.();
    }, milliseconds);
    return () => {
      clearTimeout(timer);
    };
  }, [actionLabel, duration, onHide, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={message}
      style={[styles.base, animated]}
    >
      <View style={styles.dot} />
      <Text variant="toast" tone="inverse" style={styles.message}>
        {message}
      </Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={theme.spacing.sm}
        >
          <Text variant="toast" tone="inverse" style={styles.action}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    alignSelf: 'center',
    maxWidth: '92%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: radius.control,
    backgroundColor: theme.colors.ink,
    ...theme.elevation.toast,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.lime,
  },
  message: { flexShrink: 1 },
  action: { textDecorationLine: 'underline' },
});
