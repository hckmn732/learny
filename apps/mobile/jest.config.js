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
    // SPEC-3001 ET-2: ce test importe les globals Vitest, il n'est pas exécutable par Jest.
    '<rootDir>/test/resolution.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // SPEC-4003 : la suite complète est sérialisée ; les animations natives d'un test ne doivent
  // pas entrer en concurrence avec un autre worker (échec intermittent de recall-card).
  maxWorkers: 1,
  // SPEC-4003 : la VM de campagne est chargée (émulateur, builds) ; 20 s laisse aux écrans le
  // temps de rendre leurs requêtes sans changer une seule assertion.
  testTimeout: 20000,
  // Transform the React Native/Expo packages, the workspace TypeScript packages (pnpm symlinks)
  // and the ESM-only dependencies of @learny/core.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@learny/.*|@date-fns/.*|mdast-util-.*|micromark.*|unist-util-.*|zwitch|devlop|character-entities.*|decode-named-character-reference|longest-streak|markdown-table|ccount|escape-string-regexp|vfile.*|bail|trough|is-plain-obj|html-url-attributes|space-separated-tokens|comma-separated-tokens|property-information|hast-util-.*|remark-.*|unified|rehype-.*))',
  ],
  moduleNameMapper: {
    // Static assets are irrelevant to behaviour: a stable stub keeps the tests fast.
    '\\.(ttf|otf|png|jpg|jpeg|gif|svg)$': '<rootDir>/test/asset-stub.js',
    // SPEC-3003 ET-1 — native modules of the encrypted storage and of the network. The encryption
    // contract itself is proved by the Vitest suite with an injected backend; a component test
    // only needs the shape of MMKV and of NetInfo.
    '^react-native-mmkv$': '<rootDir>/test/mocks/react-native-mmkv.js',
    '^@react-native-community/netinfo$': '<rootDir>/test/mocks/netinfo.js',
    // SPEC-3402 — les modules natifs des fournisseurs n'existent pas dans l'environnement de test.
    '^@react-native-google-signin/google-signin$': '<rootDir>/test/mocks/google-signin.js',
    '^expo-apple-authentication$': '<rootDir>/test/mocks/apple-authentication.js',
    // SPEC-4003 — sélecteurs natifs, date picker et API legacy du système de fichiers.
    '^expo-document-picker$': '<rootDir>/test/mocks/expo-document-picker.js',
    '^expo-image-picker$': '<rootDir>/test/mocks/expo-image-picker.js',
    '^@react-native-community/datetimepicker$': '<rootDir>/test/mocks/datetimepicker.js',
    '^expo-file-system/legacy$': '<rootDir>/test/mocks/expo-file-system-legacy.js',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.tsx', '!**/*.test.{ts,tsx}'],
};
