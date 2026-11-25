// SPEC-4003 — native image selector stub.
module.exports = {
  requestCameraPermissionsAsync: () => Promise.resolve({ granted: true }),
  requestMediaLibraryPermissionsAsync: () => Promise.resolve({ granted: true }),
  launchCameraAsync: () => Promise.resolve({ canceled: true, assets: null }),
  launchImageLibraryAsync: () => Promise.resolve({ canceled: true, assets: null }),
  MediaTypeOptions: { Images: 'Images' },
};
