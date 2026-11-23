// Legend of the activity kinds (SPEC-3203 EF-1, BR-AGE-02).
//
// The list icon of the header opens this sheet: one row per kind of schedule slot, with the dot
// colour of `@learny/ui/tokens` and the label the server uses, then the note of the shared web
// catalogue on the margins (BR-AGE-06).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';
import { slotKindColor, slotKindLabel, SLOT_KIND_ORDER } from '@learny/ui/tokens';

import { theme } from '../../theme';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

export interface LegendSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/** Legend of the colours of the agenda. */
export function LegendSheet({ visible, onClose }: LegendSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={fr.agenda.legendTitle}
      testID="agenda-legend-sheet"
    >
      <View style={styles.list}>
        {SLOT_KIND_ORDER.map((kind) => (
          <View key={kind} testID={`agenda-legend-${kind}`} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: slotKindColor(kind) }]} />
            <Text variant="rowSubtitle">{slotKindLabel(kind)}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {fr.agenda.legendNote}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  dot: { width: 10, height: 10, borderRadius: theme.radius.pill },
});
