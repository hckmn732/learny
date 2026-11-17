import type { MetadataRoute } from 'next';

import { colors } from '@learny/ui/tokens';

// EF-1 — installable Web App manifest (SPEC-801, BR-PLA-01). The values are contractual: the
// installability audit and the e2e test read them as is.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Learny',
    short_name: 'Learny',
    description: 'Apprenez intensément, retenez durablement.',
    lang: 'fr',
    dir: 'ltr',
    id: '/accueil',
    start_url: '/accueil?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: colors.canvas,
    theme_color: colors.ink,
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
