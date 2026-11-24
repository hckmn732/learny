// Progress bar (SPEC-3002 EF-2, ET-6): linear and segmented forms, announced as a progressbar
// with its value so that a screen reader gives the percentage (BR-PLA-03).
import { StyleSheet, View } from 'react-native';

import { controls, theme } from '../theme';

export interface ProgressBarProps {
  readonly value: number;
  /** Announced label of the bar (« Progression du chapitre »). */
  readonly label: string;
  readonly variant?: 'linear' | 'segments';
  /** Number of segments of the quiz progress (variant `segments`). */
  readonly segments?: number;
  /** Current segment, 0-based (variant `segments`). */
  readonly current?: number;
  readonly onDark?: boolean;
  readonly testID?: string;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progress of a chapter, of a quiz or of a set of segments. */
export function ProgressBar({
  value,
  label,
  variant = 'linear',
  segments = 0,
  current = 0,
  onDark = false,
  testID,
}: ProgressBarProps) {
  const percentage = Math.round(clamp(value) * 100);

  if (variant === 'segments') {
    const count = Math.max(1, segments);
    return (
      <View
        {...(testID === undefined ? {} : { testID })}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: percentage }}
        style={styles.segments}
      >
        {Array.from({ length: count }, (_, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <View
              key={index}
              testID={`progress-segment-${String(index)}`}
              style={[
                styles.segment,
                {
                  backgroundColor: done
                    ? theme.colors.lime
                    : active
                      ? theme.colors.ink
                      : theme.colors.border,
                },
              ]}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      style={[
        styles.track,
        { backgroundColor: onDark ? theme.colors.darkSurface : theme.colors.border },
      ]}
    >
      <View
        testID={testID === undefined ? undefined : `${testID}-fill`}
        style={[styles.fill, { width: `${String(percentage)}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: controls.progressTrack,
    width: '100%',
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
  },
  segments: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    width: '100%',
  },
  segment: {
    flex: 1,
    height: controls.progressSegment,
    borderRadius: controls.progressSegment,
  },
});
