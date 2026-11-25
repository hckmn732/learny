// Barre de progression du traitement d'un document déposé (QA 2026-11-25).
//
// L'API ne donne que l'état (`queued`, `processing`, `ready`, `failed`), pas un pourcentage : la
// barre est une estimation qui avance vite puis ralentit, plafonne à 92 % tant que l'analyse
// tourne, passe à 100 % quand le document est prêt et devient rouge en cas d'échec. Aucun chiffre
// n'est affiché, pour ne pas promettre une précision que le serveur ne fournit pas.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '../lib/motion';
import { theme } from '../theme';

export type SourceStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** Durée de la montée estimée jusqu'au plafond, en millisecondes. */
const ESTIMATED_MS = 90_000;

export function SourceProgress({
  status,
  testID,
}: {
  readonly status: SourceStatus;
  readonly testID?: string;
}) {
  const reduced = useReducedMotion();
  const width = useSharedValue(status === 'ready' ? 100 : 4);

  useEffect(() => {
    if (status === 'ready' || status === 'failed') {
      width.value = withTiming(100, { duration: reduced ? 0 : 400 });
      return;
    }
    const target = status === 'queued' ? 12 : 92;
    width.value = withTiming(target, {
      duration: reduced ? 0 : status === 'queued' ? 4000 : ESTIMATED_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduced, status, width]);

  const animated = useAnimatedStyle(() => ({ width: `${String(width.value)}%` }));
  const color =
    status === 'failed'
      ? theme.colors.danger
      : status === 'ready'
        ? theme.colors.green
        : theme.colors.lime;

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: status === 'queued' || status === 'processing' }}
      {...(testID === undefined ? {} : { testID })}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color }, animated]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
});
