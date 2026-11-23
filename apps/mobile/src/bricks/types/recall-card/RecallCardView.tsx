// `recall-card` brick (SPEC-3301 EF-6, ET-4): recto « Touchez pour révéler », verso with the answer
// and its source, flip on the Y axis and no animation when the system reduces motion (BR-PLA-03).
//
// The buttons under the card belong to the parent screen (self-assessment of the global quiz,
// « À revoir »/« Je savais » of the warm-up): the brick only exposes `actions`.
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { transitionDuration, useReducedMotion } from '../../../lib/motion';
import { radius, theme } from '../../../theme';
import { Text } from '../../../ui';
import { Markdown } from '../../../ui/Markdown';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { BrickCard, InvalidCharge, Sources } from '../../shared';

const t = fr.mobile.bricks;
const FLIP_MS = 320;

/** One recall card, recto and verso, with the self-assessment buttons of its screen. */
export function RecallCardView({ brick, correction, actions, testID }: NativeBrickViewProps) {
  const parsed = parsePublicPayload('recall_card', brick.publicPayload);
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(
    () => () => {
      animation.current?.stop();
    },
    [],
  );

  if (!parsed.ok) return <InvalidCharge type="recall_card" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'recall_card' ? correction : undefined;

  function flip(): void {
    const next = !revealed;
    setRevealed(next);
    // Une animation en vol est arrêtée avant d'en démarrer une autre : sans cela, le pilote natif
    // cherche une vue déjà démontée (« Unable to locate attached view in the native tree »).
    animation.current?.stop();
    animation.current = Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: transitionDuration(reduceMotion, FLIP_MS),
      useNativeDriver: true,
    });
    animation.current.start();
  }

  const frontStyle = {
    transform: [
      { perspective: 800 },
      {
        rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
      },
    ],
  };
  const backStyle = {
    transform: [
      { perspective: 800 },
      {
        rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }),
      },
    ],
  };

  const backMarkdown = [
    payload.back,
    payload.mnemonic === undefined ? '' : `> **${t.takeaway}**\n>\n> ${payload.mnemonic}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');

  return (
    <BrickCard type="recall_card" testID={testID}>
      <View style={styles.stage}>
        <Pressable
          accessibilityHint={t.reveal}
          accessibilityLabel={`${t.recallFront} — ${payload.front}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: revealed }}
          onPress={flip}
          style={styles.pressable}
          testID="brick-recall-front"
        >
          <Animated.View
            pointerEvents={revealed ? 'none' : 'auto'}
            style={[styles.face, styles.front, frontStyle]}
          >
            <Text variant="label" tone="muted">
              {t.recallFront}
            </Text>
            <Markdown markdown={payload.front} testID="brick-recall-front-markdown" />
            <Text variant="caption" tone="indigoInk">
              {t.reveal}
            </Text>
          </Animated.View>
          <Animated.View
            pointerEvents={revealed ? 'auto' : 'none'}
            style={[styles.face, styles.back, backStyle]}
          >
            <Text variant="label" tone="muted">
              {t.recallBack}
            </Text>
            <Markdown markdown={backMarkdown} testID="brick-recall-back-markdown" />
            {payload.sourceLabel === undefined ? null : (
              <Text variant="caption" tone="secondary">
                {t.recallSource(payload.sourceLabel)}
              </Text>
            )}
          </Animated.View>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: revealed }}
        onPress={flip}
        testID="brick-reveal"
      >
        <Text variant="buttonSmall" tone="indigoInk">
          {revealed ? t.hide : t.reveal}
        </Text>
      </Pressable>
      {graded === undefined ? null : (
        <Text variant="caption" tone="secondary" testID="brick-recall-grade">
          {t.types.recall_card}
        </Text>
      )}
      <Sources sources={payload.sources} />
      {actions}
    </BrickCard>
  );
}

const styles = StyleSheet.create({
  stage: { minHeight: 200 },
  pressable: { flex: 1, minHeight: 200 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 200,
    gap: theme.spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: theme.spacing.lg,
    backfaceVisibility: 'hidden',
  },
  front: { backgroundColor: theme.colors.canvas, borderColor: theme.colors.border },
  back: { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.borderStrong },
});
