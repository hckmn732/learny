// Skeleton (SPEC-3002 EF-2): placeholder of a loading block, pulsing on the UI thread unless the
// system reduces motion, in which case it stays still (ET-4).
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated from 'react-native-reanimated';

import { radius, theme } from '../theme';

import { usePulseStyle } from './motion';

export interface SkeletonProps {
  readonly width?: DimensionValue;
  readonly height?: number;
  /** Number of stacked lines (a paragraph placeholder). */
  readonly lines?: number;
  readonly testID?: string;
}

/** Grey block shown while its content loads. */
export function Skeleton({ width = '100%', height = 16, lines = 1, testID }: SkeletonProps) {
  const animated = usePulseStyle(true, theme.durations.skeleton);
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
      style={styles.base}
    >
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Animated.View
          key={index}
          testID={testID === undefined ? undefined : `${testID}-line-${String(index)}`}
          style={[styles.line, animated, { width, height }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.sm, width: '100%' },
  line: { borderRadius: radius.control, backgroundColor: theme.colors.surfaceMuted },
});
