// « Série de 12 jours » of the session (SPEC-3305 BR-GAM-02, EF-1): the fourteen last days as cells.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import { streakCells } from './session-state';

const t = fr.mobile.reviser.streak;

export interface StreakStripProps {
  readonly days: number;
}

/** Card of the streak (BR-GAM-02). */
export function StreakStrip({ days }: StreakStripProps) {
  const cells = streakCells(days);
  return (
    <View accessibilityLabel={t.label(days)} testID="review-streak">
      <Card>
        <View style={styles.row}>
          <Icon name="flame" size={20} color={theme.colors.orange} />
          <View style={styles.body}>
            <View style={styles.line}>
              <Text variant="title">{t.title(days)}</Text>
              <Text variant="caption" tone="muted">
                {t.subtitle}
              </Text>
            </View>
            <View style={styles.cells}>
              {cells.map((lit, index) => (
                <View
                  key={index}
                  style={[styles.cell, lit ? styles.lit : styles.unlit]}
                  testID={`review-streak-cell-${String(index)}`}
                />
              ))}
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  body: { flex: 1, gap: theme.spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cells: { flexDirection: 'row', gap: 3 },
  cell: { flex: 1, height: 8, borderRadius: radius.chip },
  lit: { backgroundColor: theme.colors.lime },
  unlit: { backgroundColor: theme.colors.surfaceMuted },
});
