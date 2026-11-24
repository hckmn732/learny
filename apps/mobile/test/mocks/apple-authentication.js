// Jest mock of the native Apple authentication module (SPEC-3402). The iOS button is rendered only
// on iOS; the tests that need it replace this mock locally (see `provider-buttons.test.tsx`).
const Button = () => null;

module.exports = {
  __esModule: true,
  default: Button,
  AppleAuthenticationButton: Button,
  AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1, WHITE_OUTLINE: 2 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: () => Promise.reject(new Error('Apple authentication indisponible en test.')),
};
