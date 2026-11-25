// Micro-animations of the catch-up screens (maquettes design/app-mobile-rattrapage, QA 2026-11-25).
//
// Light, varied motion that makes the screens feel alive: entrances in cascade, breathing,
// glows, sheens, floating icons, confetti. Everything runs on the UI thread (Reanimated) and stops
// when the system asks to reduce motion: the content is then shown still, never hidden.
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '../../lib/motion';
import { theme } from '../../theme';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Test builds (Maestro, `build-e2e.mjs` sets `EXPO_PUBLIC_SDD_PUSH_MOCK`) keep looping animations
 * still: UIAutomator waits for an idle screen before each step and a never-ending loop would block
 * it. Real builds animate; entrances play in both.
 */
const E2E_STILL = process.env.EXPO_PUBLIC_SDD_PUSH_MOCK === '1';

/** Reduced motion, or a test build: looping animations stay still. */
export function useStillMotion(): boolean {
  const reduced = useReducedMotion();
  return reduced || E2E_STILL;
}
const SINE = Easing.inOut(Easing.sin);

/** Entrance of a block: fades and rises, `index` staggers the siblings of a list. */
export function Rise({
  index = 0,
  step = 70,
  distance = 14,
  style,
  children,
  testID,
}: {
  readonly index?: number;
  readonly step?: number;
  readonly distance?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(index * step, withTiming(1, { duration: 480, easing: EASE }));
  }, [index, progress, reduced, step]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));
  return (
    <Animated.View style={[style, animated]} {...(testID === undefined ? {} : { testID })}>
      {children}
    </Animated.View>
  );
}

/** A value looping between 0 and 1 (and back), for breathing, floating or pulsing effects. */
export function useLoop(duration: number, delay = 0) {
  const reduced = useStillMotion();
  const value = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      value.value = 0;
      return;
    }
    value.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: SINE }), -1, true));
  }, [delay, duration, reduced, value]);
  return value;
}

/** Gentle scale breathing, for a selected choice or a call to action. */
export function Breathe({
  amount = 0.03,
  duration = 1300,
  style,
  children,
}: {
  readonly amount?: number;
  readonly duration?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const loop = useLoop(duration);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: 1 + loop.value * amount }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Slow vertical float of an icon or a card. */
export function Float({
  distance = 3,
  duration = 1600,
  delay = 0,
  style,
  children,
}: {
  readonly distance?: number;
  readonly duration?: number;
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const loop = useLoop(duration, delay);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -loop.value * distance }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A soft halo that pulses behind its content (a priority badge, a timer, a live dot). */
export function Glow({
  color = theme.colors.lime,
  radius = theme.radius.pill,
  spread = 6,
  duration = 1100,
  style,
  children,
}: {
  readonly color?: string;
  readonly radius?: number;
  readonly spread?: number;
  readonly duration?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const loop = useLoop(duration);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.12 + loop.value * 0.33,
    transform: [{ scale: 1 + loop.value * 0.06 }],
  }));
  return (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { margin: -spread, borderRadius: radius + spread, backgroundColor: color },
          halo,
        ]}
      />
      {children}
    </View>
  );
}

/** A light sweeping across its content every few seconds (main buttons, hero cards). */
export function Shine({
  every = 3600,
  radius = theme.radius.pill,
  style,
  children,
}: {
  readonly every?: number;
  readonly radius?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const reduced = useStillMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    sweep.value = withRepeat(
      withSequence(
        withTiming(0, { duration: every * 0.65 }),
        withTiming(1, { duration: every * 0.35, easing: SINE }),
      ),
      -1,
    );
  }, [every, reduced, sweep]);
  const bar = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 1,
    transform: [{ translateX: -120 + sweep.value * 520 }, { skewX: '-20deg' }],
  }));
  return (
    <View style={[style, { borderRadius: radius, overflow: 'hidden' }]}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.sheen, bar]} />
    </View>
  );
}

/** Small twinkle (scale and turn) of a sparkle or a search icon. */
export function Twinkle({
  duration = 1200,
  turn = 14,
  style,
  children,
}: {
  readonly duration?: number;
  readonly turn?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const loop = useLoop(duration);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + loop.value * 0.18 }, { rotate: `${String(loop.value * turn)}deg` }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A pop when a value appears (a score, a check, a tick). */
export function Pop({
  delay = 0,
  style,
  children,
}: {
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withDelay(delay, withTiming(1, { duration: 220 }));
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.12, { duration: 260, easing: EASE }),
        withTiming(1, { duration: 180 }),
      ),
    );
  }, [delay, opacity, reduced, scale]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A progress bar that fills on entrance (width in percent of its track). */
export function FillBar({
  percent,
  color = theme.colors.lime,
  track = theme.colors.surfaceMuted,
  height = 6,
  testID,
}: {
  readonly percent: number;
  readonly color?: string;
  readonly track?: string;
  readonly height?: number;
  readonly testID?: string;
}) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(100, percent));
  const width = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    width.value = reduced ? target : withTiming(target, { duration: 900, easing: EASE });
  }, [reduced, target, width]);
  const animated = useAnimatedStyle(() => ({ width: `${String(width.value)}%` }));
  return (
    <View
      style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}
      {...(testID === undefined ? {} : { testID })}
    >
      <Animated.View
        style={[{ height, borderRadius: height / 2, backgroundColor: color }, animated]}
      />
    </View>
  );
}

const CONFETTI = [
  { left: '8%', color: theme.colors.lime, delay: 0, size: 8 },
  { left: '22%', color: theme.colors.indigo, delay: 1200, size: 6 },
  { left: '37%', color: theme.colors.orange, delay: 2600, size: 8 },
  { left: '51%', color: theme.colors.green, delay: 600, size: 7 },
  { left: '66%', color: theme.colors.lime, delay: 3400, size: 8 },
  { left: '79%', color: theme.colors.indigo, delay: 1900, size: 6 },
  { left: '91%', color: theme.colors.orange, delay: 4200, size: 7 },
] as const;

function ConfettiPiece({
  left,
  color,
  delay,
  size,
  height,
}: {
  readonly left: `${number}%`;
  readonly color: string;
  readonly delay: number;
  readonly size: number;
  readonly height: number;
}) {
  const reduced = useStillMotion();
  const fall = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    fall.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1),
    );
  }, [delay, fall, reduced]);
  const animated = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : fall.value < 0.05 ? fall.value * 20 : 0.9,
    transform: [
      { translateY: -30 + fall.value * (height + 60) },
      { rotate: `${String(fall.value * 540)}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left,
          width: size,
          height: size * 1.5,
          borderRadius: 2,
          backgroundColor: color,
        },
        animated,
      ]}
    />
  );
}

/** Confetti falling slowly over a celebration screen (never over the controls' touch area). */
export function Confetti({ height = 800 }: { readonly height?: number }) {
  return (
    <View
      pointerEvents="none"
      style={styles.confetti}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {CONFETTI.map((piece) => (
        <ConfettiPiece key={piece.left} {...piece} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheen: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    width: 60,
    backgroundColor: theme.colors.white,
    opacity: 0.35,
  },
  confetti: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});

function Dot({ delay }: { readonly delay: number }) {
  const loop = useLoop(420, delay);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.35 + loop.value * 0.65,
    transform: [{ translateY: -loop.value * 3 }],
  }));
  return <Animated.View style={[dotStyles.dot, animated]} />;
}

/** Three dots bouncing while the tutor writes. */
export function TypingDots() {
  return (
    <View
      style={dotStyles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Dot delay={0} />
      <Dot delay={140} />
      <Dot delay={280} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.inkMuted },
});
