import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { colors } from './tokens/colors';
import { radiiPx } from './tokens/radii';
import { shadows } from './tokens/shadows';
import { fontSizesPx } from './tokens/typography';

const colorNames = Object.keys(colors);
const radiusNames = [...radiiPx.map(String), 'full'];
const shadowNames = Object.keys(shadows);
const textNames = fontSizesPx.map(String);

/**
 * Tailwind merge knows the Learny scales: a later token class replaces an earlier one of the
 * same group (`cn('p-12', 'p-14')` keeps `p-14`, `cn('bg-ink', 'bg-lime')` keeps `bg-lime`).
 */
export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: colorNames,
      text: textNames,
      radius: radiusNames,
      shadow: shadowNames,
    },
  },
});

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
