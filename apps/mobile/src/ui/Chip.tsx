// Chip (SPEC-3002 EF-2, CL-3): status of a module, filter of the agenda. A long label wraps on a
// second line instead of overflowing; a chip is only a target when it is pressable.
import { Pressable, StyleSheet, View } from 'react-native';

import { controls, theme, verticalHitSlop } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'lime' | 'ink' | 'indigo' | 'green' | 'orange' | 'outline';

export interface ChipProps {
  readonly label: string;
  readonly tone?: ChipTone;
  readonly icon?: IconName;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const TONES: Record<
  ChipTone,
  {
    background: string;
    border: string;
    tone: 'primary' | 'muted' | 'inverse' | 'limeInk' | 'indigoInk' | 'success' | 'danger';
  }
> = {
  neutral: { background: theme.colors.surfaceSubtle, border: 'transparent', tone: 'muted' },
  lime: { background: theme.colors.lime, border: theme.colors.lime, tone: 'primary' },
  ink: { background: theme.colors.ink, border: theme.colors.ink, tone: 'inverse' },
  indigo: {
    background: theme.colors.indigoSoft,
    border: theme.colors.indigoSoft,
    tone: 'indigoInk',
  },
  green: { background: theme.colors.greenSoft, border: theme.colors.greenSoft, tone: 'success' },
  orange: { background: theme.colors.orangeSoft, border: theme.colors.orangeSoft, tone: 'danger' },
  outline: { background: 'transparent', border: theme.colors.borderStrong, tone: 'primary' },
};

const ICON_COLORS: Record<ChipTone, string> = {
  neutral: theme.colors.inkMuted,
  lime: theme.colors.ink,
  ink: theme.colors.white,
  indigo: theme.colors.indigoInk,
  green: theme.colors.greenInk,
  orange: theme.colors.orangeInk,
  outline: theme.colors.ink,
};

/** Compact status or filter label. */
export function Chip({ label, tone = 'neutral', icon, onPress, testID }: ChipProps) {
  const skin = TONES[tone];
  const content = (
    <>
      {icon === undefined ? null : <Icon name={icon} size={14} color={ICON_COLORS[tone]} />}
      <Text variant="chip" tone={skin.tone} numberOfLines={2} style={styles.label}>
        {label}
      </Text>
    </>
  );
  const base = [
    styles.base,
    {
      minHeight: controls.chip,
      backgroundColor: skin.background,
      borderColor: skin.border,
    },
  ];

  if (onPress === undefined) {
    return (
      <View {...(testID === undefined ? {} : { testID })} style={base}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={verticalHitSlop(controls.chip)}
      style={base}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    maxWidth: '100%',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.chip,
    borderWidth: 1,
  },
  label: { flexShrink: 1 },
});
