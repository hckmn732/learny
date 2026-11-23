// Formation card of the Programme tab (SPEC-3202 EF-2; BR-PRO-01, BR-FOR-05).
//
// Sigil, title, server percentage, « Module 3 sur 7 · 2 nov. – 11 déc. » and the lime progress
// bar of the mockup. Pressing the card opens the switcher (BR-FOR-11).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Card } from '../../ui/Card';
import { ProgressBar } from '../../ui/ProgressBar';
import { Text } from '../../ui/Text';

import type { ProgrammeFormationView } from './view-model';

const t = fr.mobile.programme;

export interface FormationCardProps {
  readonly formation: ProgrammeFormationView;
  readonly sigil: string;
  readonly onPress: () => void;
}

/** Identity and advance of the formation being read. */
export function FormationCard({ formation, sigil, onPress }: FormationCardProps) {
  const meta =
    formation.modulePosition === null
      ? formation.dateRange
      : `${t.card.modules(formation.modulePosition, formation.moduleCount)} · ${formation.dateRange}`;
  return (
    <Pressable
      testID="programme-formation-card"
      accessibilityRole="button"
      accessibilityLabel={`${formation.title}, ${String(formation.progressPercent)} %, ${meta}`}
      onPress={onPress}
    >
      <Card>
        <View style={styles.top}>
          <View style={styles.sigil}>
            <Text variant="chip" tone="indigoInk">
              {sigil}
            </Text>
          </View>
          <View style={styles.grow}>
            <View style={styles.line}>
              <Text variant="sectionTitle" numberOfLines={1} style={styles.title}>
                {formation.title}
              </Text>
              <Text variant="sectionTitle" tone="primary">
                {String(formation.progressPercent)} %
              </Text>
            </View>
            <Text variant="rowSubtitle" tone="muted" numberOfLines={2}>
              {meta}
            </Text>
          </View>
        </View>
        <ProgressBar
          value={formation.progressPercent / 100}
          label={t.progressLabel}
          testID="programme-progress"
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sigil: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.indigoSoft,
  },
  grow: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  title: { flex: 1, minWidth: 0 },
});
