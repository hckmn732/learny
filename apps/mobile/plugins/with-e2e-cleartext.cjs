/* global require, module */
// Config plugin Expo — autorise le HTTP en clair pour les builds e2e uniquement (ADR-3018).
//
// Depuis ADR-3018, l'émulateur Android tourne sur la VM de développement et joint l'API locale
// (`http://10.0.2.2:3001`) et Supabase (`http://10.0.2.2:54321`) en clair. Android refuse le
// trafic en clair par défaut (`android:usesCleartextTraffic` vaut `false` depuis targetSdk 28) :
// sans cette autorisation, la page de démonstration affiche « API injoignable — NETWORK_ERROR ».
//
// Le plugin n'agit que si `LEARNY_E2E_CLEARTEXT=1`, variable posée par `e2e/build-e2e.mjs` : les
// builds EAS (`preview`, `production`) et la CI de release ne l'activent jamais.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withE2eCleartext(config) {
  if (process.env.LEARNY_E2E_CLEARTEXT !== '1') return config;
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application !== undefined) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
};
