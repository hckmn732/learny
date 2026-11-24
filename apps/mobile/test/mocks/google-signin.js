/* global jest */
// Jest mock of the native Google Sign-In module (SPEC-3402): the TurboModule `RNGoogleSignin` does
// not exist in the test runtime. Pressing the button in a component test is covered by the local
// mock of `src/auth/providers` (see `test/auth/provider-signin.test.tsx`).
const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(() => Promise.resolve(true)),
  signIn: jest.fn(() => Promise.resolve({ data: null, type: 'cancelled' })),
  signOut: jest.fn(() => Promise.resolve(null)),
  addScopes: jest.fn(() => Promise.resolve(null)),
};

module.exports = {
  GoogleSignin,
  isCancelledResponse: (response) => response !== null && response.type === 'cancelled',
  isSuccessResponse: (response) => response !== null && response.type === 'success',
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
};
