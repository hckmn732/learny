// Context sheet of the tutor (SPEC-3303 BR-TUT-02, CA-5, ADR-3010 § 3).
//
// The six items the server built for the discussion, each with its switch: only the included ones
// are sent with the next question, and a retired item is sent as `false` (the server then leaves it
// out of the prompt). The sheet never shows a value the server did not build.
import { StyleSheet, View } from 'react-native';

import type { ContextItemDto, ContextKey } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { Text } from '../../ui/Text';

const t = fr.mobile.tutor;

export interface ContextSheetProps {
  readonly visible: boolean;
  readonly items: readonly ContextItemDto[];
  readonly include: Readonly<Record<string, boolean>>;
  readonly onToggle: (key: ContextKey) => void;
  readonly onClose: () => void;
}

/** Fiche du contexte transmis au tuteur. */
export function ContextSheet({ visible, items, include, onToggle, onClose }: ContextSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t.contextTitle} testID="tutor-context-sheet">
      <Text variant="bodySmall" tone="muted" testID="tutor-context-hint">
        {t.contextHint}
      </Text>
      {items.length === 0 ? (
        <Text variant="bodySmall" tone="muted" testID="tutor-context-empty">
          {t.contextNone}
        </Text>
      ) : (
        items.map((item) => {
          const included = include[item.key] ?? item.included;
          return (
            <View key={item.key} testID={`tutor-context-${item.key}`} style={styles.item}>
              <Text variant="rowTitle">{item.label}</Text>
              <Text variant="rowSubtitle" tone="muted">
                {item.value}
              </Text>
              <View style={styles.switchRow}>
                <Text variant="caption" tone={included ? 'success' : 'muted'}>
                  {included ? t.contextIncluded : t.contextRemoved}
                </Text>
                <Switch
                  label={t.contextToggle(item.label, included)}
                  value={included}
                  onValueChange={() => {
                    onToggle(item.key);
                  }}
                  testID={`tutor-context-switch-${item.key}`}
                />
              </View>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
});
