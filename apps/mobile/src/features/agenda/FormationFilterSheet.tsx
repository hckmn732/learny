// Filter of the agenda by formation (SPEC-3203 EF-1, EF-8, BR-AGE-01, CA-3).
//
// The chip under the header opens this sheet: « Toutes les formations » then every formation of
// the agenda answer (active, paused or completed). The choice is displayed by the chip and sent
// back to the screen, which re-reads the period with the new filter.
import { Pressable, StyleSheet, View } from 'react-native';

import type { AgendaFormation } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

/** The value of the « all formations » filter, as the contract spells it. */
export const ALL_FORMATIONS = 'all';

export interface FormationFilterSheetProps {
  readonly visible: boolean;
  readonly formations: readonly AgendaFormation[];
  readonly value: string;
  readonly onSelect: (formationId: string) => void;
  readonly onClose: () => void;
}

/** Sheet of the formation filter. */
export function FormationFilterSheet({
  visible,
  formations,
  value,
  onSelect,
  onClose,
}: FormationFilterSheetProps) {
  const t = fr.mobile.agenda;
  const options = [
    { id: ALL_FORMATIONS, title: t.filterAll },
    ...formations.map((formation) => ({ id: formation.id, title: formation.title })),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={t.filterLabel} testID="agenda-filter-sheet">
      <View accessibilityRole="menu" style={styles.list}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              testID={`agenda-filter-${option.id}`}
              accessibilityRole="menuitem"
              accessibilityLabel={option.title}
              accessibilityState={{ selected }}
              onPress={() => {
                onSelect(option.id);
                onClose();
              }}
              style={[styles.row, selected ? styles.rowSelected : null]}
            >
              <Text variant="rowTitle" style={styles.title} numberOfLines={2}>
                {option.title}
              </Text>
              {selected ? <Icon name="check" size={18} color={theme.colors.ink} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.list,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowSelected: { borderColor: theme.colors.ink },
  title: { flex: 1 },
});
