// Jest configuration (SPEC-3001 ET-2, EF-3; SPEC-3003 ET-1). Components and screens only: the pure
// logic of `src/**` and `e2e/**` is covered by Vitest (canevas § 5).
// `jest-expo/android` is the platform of the SDD validation (ADR-3004 § 6).
module.exports = {
  preset: 'jest-expo/android',
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.test.tsx'],
  // `test/integration/**` belongs to Vitest (canevas § 5): it talks to the local API.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/test/integration/',
    // SPEC-3002 CA-5: the lint-rule proof is a Vitest (Node) test, not a component test.
    '<rootDir>/test/lint-rules.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Transform the React Native/Expo packages, the workspace TypeScript packages (pnpm symlinks)
  // and the ESM-only dependencies of @learny/core.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@learny/.*|@date-fns/.*))',
  ],
  moduleNameMapper: {
    // Static assets are irrelevant to behaviour: a stable stub keeps the tests fast.
    '\\.(ttf|otf|png|jpg|jpeg|gif|svg)$': '<rootDir>/test/asset-stub.js',
    // SPEC-3003 ET-1 — native modules of the encrypted storage and of the network. The encryption
    // contract itself is proved by the Vitest suite with an injected backend; a component test
    // only needs the shape of MMKV and of NetInfo.
    '^react-native-mmkv$': '<rootDir>/test/mocks/react-native-mmkv.js',
    '^@react-native-community/netinfo$': '<rootDir>/test/mocks/netinfo.js',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.tsx', '!**/*.test.{ts,tsx}'],
};
