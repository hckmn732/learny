// iOS list row (SPEC-3002 EF-2): inset white list, hairline separators and a chevron.
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Icon } from './Icon';
import type { ListRowProps } from './ListRow.types';
import { Text } from './Text';

/** Row of an iOS inset list. */
export function ListRow({
  title,
  subtitle,
  titleLines = 1,
  icon,
  onPress,
  trailing,
  separator = true,
  testID,
}: ListRowProps) {
  const content = (
    <>
      {icon === undefined ? null : (
        <View style={styles.icon}>
          <Icon name={icon} size={18} color={theme.colors.ink} />
        </View>
      )}
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="rowSubtitle" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing === undefined ? null : trailing}
      {onPress === undefined ? null : (
        <Icon name="chevronRight" size={16} color={theme.colors.inkMuted} />
      )}
    </>
  );

  const style = [styles.row, separator ? styles.separator : null];

  if (onPress === undefined) {
    return (
      <View {...(testID === undefined ? {} : { testID })} style={style}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="button"
      accessibilityLabel={subtitle === undefined ? title : `${title}, ${subtitle}`}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  separator: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
});
