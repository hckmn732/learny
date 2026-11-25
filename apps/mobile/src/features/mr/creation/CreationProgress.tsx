// Progression segmentée des écrans de création (maquettes Cadrage et PremiersPas).
//
// Cinq segments de 4 pt : encre pour le cadrage, citron pour les premiers pas. Une seule barre
// porte l'annonce du lecteur d'écran (`progressbar`), les segments restent décoratifs.
import { StyleSheet, View } from 'react-native';

import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useLoop } from '../motion';
import { controls, theme } from '../../../theme';

export interface CreationProgressProps {
  /** Nombre de segments remplis (0 à `total`). */
  readonly filled: number;
  readonly total?: number;
  readonly label: string;
  readonly tone?: 'ink' | 'lime';
  readonly testID?: string;
}

/** Barre de progression du cadrage et de la configuration initiale. */
export function CreationProgress({
  filled,
  total = 5,
  label,
  tone = 'ink',
  testID,
}: CreationProgressProps) {
  const safe = Math.max(0, Math.min(total, filled));
  const active = tone === 'lime' ? theme.colors.lime : theme.colors.ink;
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: safe }}
      style={styles.row}
    >
      {Array.from({ length: total }, (_, index) =>
        index === safe - 1 ? (
          <CurrentSegment key={index} color={active} />
        ) : (
          <View
            key={index}
            style={[
              styles.segment,
              { backgroundColor: index < safe ? active : theme.colors.border },
            ]}
          />
        ),
      )}
    </View>
  );
}

/** The step in progress: filled, with a slow shimmer. */
function CurrentSegment({ color }: { readonly color: string }) {
  const loop = useLoop(900);
  const animated = useAnimatedStyle(() => ({ opacity: 1 - loop.value * 0.45 }));
  return <Animated.View style={[styles.segment, { backgroundColor: color }, animated]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.xs, width: '100%' },
  segment: {
    flex: 1,
    height: controls.progressSegment,
    borderRadius: controls.progressSegment,
  },
});
