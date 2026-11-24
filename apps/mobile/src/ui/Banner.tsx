// Banner (SPEC-3002 EF-2): the offline band and the informational band of a screen.
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface BannerAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface BannerProps {
  readonly tone?: 'offline' | 'info';
  readonly title?: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly action?: BannerAction;
  readonly testID?: string;
}

const TONES = {
  offline: {
    background: theme.colors.offlineSoft,
    icon: 'alert' as IconName,
    color: theme.colors.ink,
  },
  info: {
    background: theme.colors.indigoSoft,
    icon: 'sparkles' as IconName,
    color: theme.colors.indigoInk,
  },
} as const;

/** Informational band, never a dialog: it does not block the screen. */
export function Banner({ tone = 'info', title, description, icon, action, testID }: BannerProps) {
  const skin = TONES[tone];
  const t = fr.mobile.ui;
  const heading = title ?? (tone === 'offline' ? t.offlineTitle : undefined);

  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="alert"
      style={[styles.base, { backgroundColor: skin.background }]}
    >
      <Icon name={icon ?? skin.icon} size={18} color={skin.color} />
      <View style={styles.texts}>
        {heading === undefined ? null : (
          <Text variant="title" tone={tone === 'offline' ? 'primary' : 'indigoInk'}>
            {heading}
          </Text>
        )}
        {description === undefined ? null : (
          <Text variant="rowSubtitle" tone={tone === 'offline' ? 'secondary' : 'indigoInk'}>
            {description}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={theme.spacing.sm}
        >
          <Text variant="chip" tone={tone === 'offline' ? 'primary' : 'indigoInk'}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: radius.control,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
