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

// SPEC-3501 — notifications of the device. `expo-notifications` is a native module (its channel
// manager only exists on a device): the process-wide stub below answers the platform questions with
// neutral values, so a screen that mounts the device channel renders without one. No test asserts
// these defaults; a suite that needs another state overrides them locally with its own `jest.mock`.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'undetermined', canAskAgain: true }),
  ),
  getDevicePushTokenAsync: jest.fn(() => Promise.resolve({ type: 'android', data: '' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: '' })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getNotificationChannelsAsync: jest.fn(() => Promise.resolve([])),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  AndroidNotificationVisibility: { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3 },
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
    DATE: 'date',
    DAILY: 'daily',
    CALENDAR: 'calendar',
  },
}));
