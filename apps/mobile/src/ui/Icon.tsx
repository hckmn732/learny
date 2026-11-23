// Icon component (SPEC-3002 EF-2 and § 8.3): strokes of 1.8 px on the 24 × 24 grid of the
// mockups. A decorative icon is hidden from assistive technologies; an icon that carries meaning
// gets an `accessibilityLabel` (BR-PLA-03).
import { Svg } from 'react-native-svg';

import { theme } from '../theme';

import { FILL_ICONS, isFilledIcon, STROKE_ICONS, type IconName } from './icons';

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
  /** Set it when the icon carries information; without it the icon is decorative. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** One icon of the design set, drawn with `react-native-svg`. */
export function Icon({
  name,
  size = 20,
  color = theme.colors.ink,
  accessibilityLabel,
  testID,
}: IconProps) {
  const filled = isFilledIcon(name);
  const decorative = accessibilityLabel === undefined;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      // SPEC-3402 — `currentColor` of a filled mark (the Apple logo) follows the colour of the
      // component, so the same icon is white on the black button and ink elsewhere.
      color={color}
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(testID === undefined ? {} : { testID })}
      {...(decorative ? {} : { accessibilityLabel, accessibilityRole: 'image' })}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessible={!decorative}
    >
      {filled ? FILL_ICONS[name] : STROKE_ICONS[name]}
    </Svg>
  );
}
