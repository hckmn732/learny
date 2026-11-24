// Babel configuration of the mobile application (SPEC-3001 § 8.1).
// `babel-preset-expo` covers TypeScript, Expo Router, the new architecture and the inlining of
// `process.env.EXPO_PUBLIC_*` at build time.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
