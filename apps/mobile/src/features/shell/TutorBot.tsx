// Little animated tutor of the onboarding gate (QA hot fix, 2026-11-25): it floats, blinks, its
// antenna glows and it waves. Static when the system asks to reduce motion.
/* eslint-disable @typescript-eslint/no-deprecated -- x/y are the SVG geometry attributes of <Rect>, not the RN layout props. */
import { useEffect, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { theme } from '../../theme';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const c = theme.colors;

export interface TutorBotProps {
  readonly size?: number;
  readonly testID?: string;
}

/** A friendly robot tutor, drawn in the colours of the app. */
export function TutorBot({ size = 180, testID }: TutorBotProps): ReactElement {
  const reduced = useReducedMotion();
  const float = useSharedValue(0);
  const blink = useSharedValue(1);
  const glow = useSharedValue(0.55);
  const wave = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(withTiming(1, { duration: 1800, easing: ease }), -1, true);
    glow.value = withRepeat(withTiming(1, { duration: 900, easing: ease }), -1, true);
    blink.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(0.1, { duration: 90 })),
        withTiming(1, { duration: 120 }),
      ),
      -1,
    );
    wave.value = withRepeat(
      withSequence(
        withDelay(1400, withTiming(1, { duration: 260, easing: ease })),
        withTiming(-0.4, { duration: 260, easing: ease }),
        withTiming(1, { duration: 260, easing: ease }),
        withTiming(0, { duration: 260, easing: ease }),
      ),
      -1,
    );
  }, [reduced, float, glow, blink, wave]);

  const floating = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * float.value }] }));
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.18 + 0.1 * (1 - float.value),
    transform: [{ scaleX: 1 - 0.12 * float.value }],
  }));
  const leftEye = useAnimatedProps(() => ({ ry: 9 * blink.value }));
  const rightEye = useAnimatedProps(() => ({ ry: 9 * blink.value }));
  const bulb = useAnimatedProps(() => ({ opacity: glow.value }));
  const halo = useAnimatedProps(() => ({ r: 9 + 5 * glow.value, opacity: 0.35 * glow.value }));
  // Pivot at the shoulder (122, 126).
  const arm = useAnimatedProps(() => ({ rotation: -28 * wave.value, originX: 122, originY: 126 }));

  return (
    <View style={{ width: size, height: size }} testID={testID} accessible={false}>
      <Animated.View style={[styles.shadow, shadow]} />
      <Animated.View style={[StyleSheet.absoluteFill, floating]}>
        <Svg height={size} viewBox="0 0 180 180" width={size}>
          {/* Soft lime glow behind the tutor. */}
          <Circle cx={90} cy={92} fill={c.limeSoft} r={70} />
          {/* Antenna. */}
          <Line
            stroke={c.ink}
            strokeLinecap="round"
            strokeWidth={4}
            x1={90}
            x2={90}
            y1={40}
            y2={24}
          />
          <AnimatedCircle animatedProps={halo} cx={90} cy={20} fill={c.lime} />
          <AnimatedCircle animatedProps={bulb} cx={90} cy={20} fill={c.lime} r={7} />
          <Circle cx={90} cy={20} fill="none" r={7} stroke={c.ink} strokeWidth={3} />
          {/* Ears. */}
          <Rect fill={c.indigo} height={22} rx={6} width={12} x={32} y={66} />
          <Rect fill={c.indigo} height={22} rx={6} width={12} x={136} y={66} />
          {/* Head. */}
          <Rect
            fill={c.white}
            height={76}
            rx={26}
            stroke={c.ink}
            strokeWidth={4}
            width={100}
            x={40}
            y={40}
          />
          {/* Face screen. */}
          <Rect fill={c.ink} height={46} rx={18} width={76} x={52} y={53} />
          <AnimatedEllipse animatedProps={leftEye} cx={74} cy={74} fill={c.lime} rx={7} />
          <AnimatedEllipse animatedProps={rightEye} cx={106} cy={74} fill={c.lime} rx={7} />
          <Path
            d="M80 88 Q90 95 100 88"
            fill="none"
            stroke={c.lime}
            strokeLinecap="round"
            strokeWidth={3.5}
          />
          {/* Cheeks. */}
          <Circle cx={60} cy={92} fill={c.orange} opacity={0.55} r={5} />
          <Circle cx={120} cy={92} fill={c.orange} opacity={0.55} r={5} />
          {/* Body. */}
          <Rect
            fill={c.lime}
            height={40}
            rx={18}
            stroke={c.ink}
            strokeWidth={4}
            width={64}
            x={58}
            y={116}
          />
          <Circle cx={90} cy={136} fill={c.white} r={7} stroke={c.ink} strokeWidth={3} />
          {/* Left arm, resting. */}
          <Path
            d="M58 128 Q44 136 46 150"
            fill="none"
            stroke={c.ink}
            strokeLinecap="round"
            strokeWidth={5}
          />
          {/* Right arm, waving. */}
          <AnimatedG animatedProps={arm}>
            <Path
              d="M122 126 Q138 118 140 100"
              fill="none"
              stroke={c.ink}
              strokeLinecap="round"
              strokeWidth={5}
            />
            <Circle cx={140} cy={96} fill={c.white} r={6} stroke={c.ink} strokeWidth={3} />
          </AnimatedG>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 4,
    left: '30%',
    width: '40%',
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.ink,
  },
});
