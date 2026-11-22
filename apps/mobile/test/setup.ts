// Jest setup (SPEC-3001 EF-3). The native modules a component touches are stubbed so that a
// component test never needs a device; React Native Testing Library registers its built-in
// matchers when it is imported (v13+), so there is nothing else to extend here.
//
// `expo-font` is embedded natively at build time; the test environment reports the fonts as ready.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));
