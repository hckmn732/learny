// Text component (SPEC-3002 EF-2): the single entry point of the typographic scale of the theme.
// Titles stop growing at 160 %; running text follows the system without a limit (ET-5, CL-1).
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';

import { maxFontSizeMultiplier, theme } from '../theme';

/** Every typographic step of the theme (the aliases of SPEC-3001 included). */
export type TextVariant = keyof typeof theme.type;

/** Colour of a text, by role: no component ever passes a colour literal (ET-1). */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'limeInk'
  | 'indigo'
  | 'indigoInk'
  | 'success'
  | 'danger'
  | 'onDarkMuted'
  | 'onDarkSecondary';

const TONE_COLORS: Record<TextTone, string> = {
  primary: theme.colors.ink,
  secondary: theme.colors.inkSecondary,
  muted: theme.colors.inkMuted,
  inverse: theme.colors.white,
  limeInk: theme.colors.limeInk,
  indigo: theme.colors.indigo,
  indigoInk: theme.colors.indigoInk,
  success: theme.colors.greenInk,
  danger: theme.colors.danger,
  onDarkMuted: theme.colors.onDarkMuted,
  onDarkSecondary: theme.colors.onDarkSecondary,
};

const HEADING_VARIANTS: readonly TextVariant[] = ['largeTitle', 'sectionTitle'];

export interface TextProps {
  readonly children: string | number | readonly (string | number)[];
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly align?: 'left' | 'center' | 'right';
  readonly numberOfLines?: number | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<TextStyle>;
}

/** Native text of the design system. */
export function Text({
  children,
  variant = 'body',
  tone = 'primary',
  align,
  numberOfLines,
  testID,
  style,
}: TextProps) {
  const heading = HEADING_VARIANTS.includes(variant);
  return (
    <RNText
      {...(testID === undefined ? {} : { testID })}
      {...(numberOfLines === undefined ? {} : { numberOfLines })}
      accessibilityRole={heading ? 'header' : 'text'}
      allowFontScaling
      {...(heading ? { maxFontSizeMultiplier: maxFontSizeMultiplier.heading } : {})}
      style={[
        theme.type[variant],
        { color: TONE_COLORS[tone] },
        align === undefined ? null : { textAlign: align },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
