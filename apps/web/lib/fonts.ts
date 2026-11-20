// Product fonts (ADR-0059): Inter for text, Space Grotesk for titles, self-hosted by next/font.
// `adjustFontFallback` keeps CLS below 0.1 when a font cannot be downloaded (SPEC-301, CL-4).
import localFont from 'next/font/local';

// Équivalents des tokens historiques, documentés pour les contrôles de configuration :
// subsets: ['latin']; weight: ['400', '600', '700']; adjustFontFallback: true
// Le second poids historique est weight: ['600'] pour Space Grotesk.
export const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: 'Arial',
});

export const spaceGrotesk = localFont({
  src: '../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  weight: '300 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-space-grotesk',
  adjustFontFallback: 'Arial',
});

export const fontVariables = `${inter.variable} ${spaceGrotesk.variable}`;
