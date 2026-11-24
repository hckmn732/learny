// Jest setup (SPEC-3001 EF-3, SPEC-3002 ET-4). The native modules a component touches are stubbed
// so that a component test never needs a device; React Native Testing Library registers its
// built-in matchers when it is imported (v13+), so there is nothing else to extend here.
//
// `expo-font` is embedded natively at build time; the test environment reports the fonts as ready.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// The splash screen is a native call: it has nothing to do in a component test.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

// Haptics are optional feedback (SPEC-3002 EF-4): the test environment has no engine.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Reanimated 4 needs its worklets runtime; the components only use opacity and translation, so a
// deterministic stub keeps the tests fast and free of the native module (ET-4).
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: (value: number) => value,
    withRepeat: (value: number) => value,
    withSequence: (...values: number[]) => values[0],
    Easing: { inOut: () => 0, ease: () => 0, linear: () => 0 },
  };
});
