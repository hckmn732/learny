// Product fonts (ADR-0059): Inter for text, Space Grotesk for titles, self-hosted by next/font.
// `adjustFontFallback` keeps CLS below 0.1 when a font cannot be downloaded (SPEC-301, CL-4).
import localFont from 'next/font/local';

// Product token contract: subsets: ['latin']; weight: ['400', '600', '700'];
// Display weight: weight: ['600']. The local files preserve these exact shipped faces;
// adjustFontFallback: true retains the generated metric-adjustment contract.
export const inter = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      weight: '700',
    },
  ],
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: 'Arial',
});

export const spaceGrotesk = localFont({
  src: '../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2',
  weight: '600',
  style: 'normal',
  display: 'swap',
  variable: '--font-space-grotesk',
  adjustFontFallback: 'Arial',
});

export const fontVariables = `${inter.variable} ${spaceGrotesk.variable}`;
