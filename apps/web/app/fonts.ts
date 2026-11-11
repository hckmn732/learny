// Product fonts (ADR-0059): Inter for text, Space Grotesk for titles, self-hosted by next/font.
import { Inter, Space_Grotesk } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const fontVariables = `${inter.variable} ${spaceGrotesk.variable}`;
