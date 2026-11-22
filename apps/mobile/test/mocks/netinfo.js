// Stub of `@react-native-community/netinfo` for Jest (SPEC-3003 EF-5).
//
// The connection state of a test is driven by `onlineManager` (the same singleton the application
// uses), so the stub only has to accept the subscription of `src/offline/network-wiring.ts`.
const state = { isConnected: true, isInternetReachable: true, type: 'wifi' };

module.exports = {
  __esModule: true,
  default: {
    addEventListener: () => () => {},
    fetch: () => Promise.resolve(state),
  },
  addEventListener: () => () => {},
  fetch: () => Promise.resolve(state),
};
