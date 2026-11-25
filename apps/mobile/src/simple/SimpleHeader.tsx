// En-tête des écrans du mode simple (SPEC-4003 EF-2, EF-6, EF-7).
//
// The mockup shows a back chevron and a large title. The diagnostic uses a cross instead of the
// chevron (EF-7): closing it equals « Passer », never a silent abandon.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';
import { IconButton } from '../ui/IconButton';
import { Text } from '../ui/Text';

export interface SimpleHeaderProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly onBack?: () => void;
  readonly onClose?: () => void;
  readonly closeLabel?: string;
  readonly right?: ReactNode;
}

/** En-tête natif d'un écran du parcours. */
export function SimpleHeader({
  title,
  eyebrow,
  onBack,
  onClose,
  closeLabel,
  right,
}: SimpleHeaderProps) {
  return (
    <View style={styles.base}>
      <View style={styles.row}>
        {onBack === undefined ? null : (
          <IconButton
            name="chevronLeft"
            accessibilityLabel="Revenir en arrière"
            onPress={onBack}
            testID="simple-back"
          />
        )}
        {onClose === undefined ? null : (
          <IconButton
            name="close"
            accessibilityLabel={closeLabel ?? 'Fermer'}
            onPress={onClose}
            testID="simple-close"
          />
        )}
        <View style={styles.titleBlock}>
          {eyebrow === undefined ? null : (
            <Text variant="eyebrow" tone="muted">
              {eyebrow}
            </Text>
          )}
          <Text variant="largeTitle" testID="simple-title">
            {title}
          </Text>
        </View>
        {right === undefined ? null : <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  titleBlock: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  right: { alignItems: 'flex-end' },
});
