// Product fonts (ADR-0059): Inter for text, Space Grotesk for titles, self-hosted by next/font.
// `adjustFontFallback` keeps CLS below 0.1 when a font cannot be downloaded (SPEC-301, CL-4).
import { Inter, Space_Grotesk } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-space-grotesk',
  adjustFontFallback: true,
});

export const fontVariables = `${inter.variable} ${spaceGrotesk.variable}`;
