// Blocs de l'aperçu du programme (SPEC-4003 EF-6, SCR-23).
//
// KPI on two columns, the deadline block with the native date selector, four module rows then
// « + N autres modules ». No business value is invented: hours and dates come from the proposal,
// page ranges from the document.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ProgrammeProposalDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

import { moduleRows, previewKpis } from './view-model';

const t = fr.mobile.simple.preview;

export interface KpiGridProps {
  readonly proposal: ProgrammeProposalDto | null;
}

/** Quatre indicateurs, deux colonnes (maquette mobile). */
export function KpiGrid({ proposal }: KpiGridProps) {
  const kpis = previewKpis(proposal);
  const cells = [
    [kpis.modules, t.kpis.modules],
    [kpis.hours, t.kpis.hours],
    [kpis.perDay, t.kpis.perDay],
    [kpis.end, t.kpis.end],
  ] as const;
  return (
    <View style={styles.kpis} testID="simple-kpis">
      {cells.map(([value, label]) => (
        <View key={label} style={styles.kpi}>
          <Text variant="figure">{value}</Text>
          <Text variant="caption" tone="muted">
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Bloc « Tu as une échéance ? » avec sélecteur natif. */
export function DeadlineBlock({
  hasDeadline,
  deadlineLabel,
  onNoDeadline,
  onPickDeadline,
  onDateSelected,
  showPicker,
  picker,
}: {
  readonly hasDeadline: boolean;
  readonly deadlineLabel: string | null;
  readonly onNoDeadline: () => void;
  readonly onPickDeadline: () => void;
  readonly onDateSelected?: (date: Date) => void;
  readonly showPicker: boolean;
  readonly picker?: ReactNode;
}) {
  return (
    <Card testID="simple-deadline" style={styles.deadline}>
      <Text variant="rowTitle">{t.deadlineTitle}</Text>
      <Text variant="caption" tone="muted">
        {t.deadlineBody}
      </Text>
      <View style={styles.deadlineButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !hasDeadline }}
          onPress={onNoDeadline}
          style={[styles.choice, !hasDeadline ? styles.choiceSelected : null]}
          testID="simple-deadline-none"
        >
          <Text variant="caption" tone={!hasDeadline ? 'inverse' : 'primary'}>
            {t.deadlineNo}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: hasDeadline }}
          onPress={onPickDeadline}
          style={[styles.choice, hasDeadline ? styles.choiceSelected : null]}
          testID="simple-deadline-yes"
        >
          <Text variant="caption" tone={hasDeadline ? 'inverse' : 'primary'}>
            {deadlineLabel === null ? t.deadlineYes : deadlineLabel}
          </Text>
        </Pressable>
      </View>
      {hasDeadline ? (
        <Text variant="caption" tone="limeInk">
          {t.deadlineGoal}
        </Text>
      ) : null}
      {showPicker && picker !== undefined ? (
        <View testID="simple-deadline-picker">
          {picker}
          {onDateSelected === undefined ? null : (
            <Button
              label={t.deadlinePick}
              variant="outline"
              size="sm"
              onPress={() => undefined}
              testID="simple-deadline-pick"
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

/** Modules de l'aperçu : quatre lignes puis le reste. */
export function ModuleList({ proposal }: { readonly proposal: ProgrammeProposalDto | null }) {
  const rows = moduleRows(proposal);
  return (
    <View style={styles.modules} testID="simple-modules">
      <View style={styles.modulesHead}>
        <Text variant="rowTitle">{t.modules}</Text>
        <Text variant="caption" tone="muted">
          {t.modulesHint}
        </Text>
      </View>
      {rows.shown.map((module) => (
        <View
          key={module.position}
          style={styles.module}
          testID={`simple-module-${String(module.position)}`}
        >
          <View style={styles.number}>
            <Text variant="label">{String(module.position)}</Text>
          </View>
          <View style={styles.moduleBody}>
            <Text variant="bodySmall" numberOfLines={1}>
              {module.title}
            </Text>
            <Text variant="caption" tone="muted">
              {`${String(module.chapters)} chapitres · ${module.hours}${module.pages === null ? '' : ` · ${module.pages}`}`}
            </Text>
          </View>
        </View>
      ))}
      {rows.others > 0 ? (
        <Text variant="caption" tone="muted" testID="simple-modules-others">
          {t.others(rows.others)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  kpi: {
    width: '48%',
    flexGrow: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.stat,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  deadline: { gap: theme.spacing.sm },
  deadlineButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  choice: {
    minHeight: theme.minTouchTarget.height,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  choiceSelected: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  modules: { gap: theme.spacing.sm },
  modulesHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  module: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  number: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  moduleBody: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
});
