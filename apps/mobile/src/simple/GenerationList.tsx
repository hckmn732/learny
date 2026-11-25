// Liste « Préparation du programme » (SPEC-4003 EF-8, EF-12 de SPEC-4001).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

import { generationRows } from './view-model';

const t = fr.mobile.simple.result;

/** État de génération des modules validés. */
export function GenerationList({
  state,
}: {
  readonly state: import('@learny/contracts').SimpleState | null;
}) {
  const rows = generationRows(state);
  if (rows.length === 0) return null;
  return (
    <View style={styles.base} testID="simple-generation">
      <Text variant="eyebrow" tone="muted">
        {t.prep}
      </Text>
      {rows.map((row, index) => (
        <View key={row.id} style={[styles.row, index === 0 ? null : styles.border]}>
          <View
            style={[
              styles.bullet,
              row.state === 'acquired'
                ? styles.acquired
                : row.state === 'ready'
                  ? styles.ready
                  : row.state === 'generating'
                    ? styles.generating
                    : styles.queued,
            ]}
          >
            {row.state === 'acquired' || row.state === 'ready' ? (
              <Icon
                name="check"
                size={13}
                color={row.state === 'acquired' ? theme.colors.greenInk : theme.colors.ink}
              />
            ) : null}
          </View>
          <View style={styles.body}>
            <Text variant="bodySmall">{row.title}</Text>
            <Text variant="caption" tone="muted">
              {row.detail}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  border: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acquired: { backgroundColor: theme.colors.greenSoft },
  ready: { backgroundColor: theme.colors.lime },
  generating: { borderWidth: 2.5, borderColor: theme.colors.indigo },
  queued: { borderWidth: 2, borderColor: theme.colors.borderStrong },
  body: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
});
