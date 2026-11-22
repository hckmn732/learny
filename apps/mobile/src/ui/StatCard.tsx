// Stat card (SPEC-3002 EF-2): the three figures of Aujourd'hui (série, rétention, lacunes).
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface StatCardProps {
  readonly label: string;
  readonly value: string;
  /** Optional unit, rendered smaller next to the figure (a percentage sign, « j »). */
  readonly unit?: string;
  readonly icon?: IconName;
  readonly tone?: 'surface' | 'lime';
  readonly onPress?: () => void;
  readonly testID?: string;
}

/** Figure with its label, optionally pressable (it then opens the detail sheet). */
export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = 'surface',
  onPress,
  testID,
}: StatCardProps) {
  const lime = tone === 'lime';
  const body = (
    <>
      <View style={styles.top}>
        {icon === undefined ? null : (
          <Icon name={icon} size={13} color={lime ? theme.colors.limeInk : theme.colors.inkMuted} />
        )}
        <Text
          variant="statLabel"
          tone={lime ? 'limeInk' : 'muted'}
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </Text>
      </View>
      <View style={styles.figureRow}>
        <Text variant="figure" tone="primary">
          {value}
        </Text>
        {unit === undefined ? null : (
          <Text variant="statLabel" tone={lime ? 'limeInk' : 'secondary'}>
            {unit}
          </Text>
        )}
      </View>
    </>
  );

  const container = [styles.base, lime ? styles.lime : styles.surface];

  if (onPress === undefined) {
    return (
      <View {...(testID === undefined ? {} : { testID })} style={container}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}${unit ?? ''}`}
      onPress={onPress}
      style={container}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    gap: theme.spacing.xs / 2,
    padding: theme.spacing.md,
    borderRadius: theme.radius.stat,
    borderWidth: 1,
    minHeight: 72,
    justifyContent: 'center',
  },
  surface: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  lime: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  label: { flexShrink: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
});
