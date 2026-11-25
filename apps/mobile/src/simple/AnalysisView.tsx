// Contenu de l'analyse (SPEC-4003 EF-4, SCR-22).
//
// Four steps with their state and detail, a progress bar, then the chapters found as they arrive.
// The mention « Tu peux fermer l'app… » is the mobile wording of EF-5; the notification is sent
// when the state becomes `proposed` (see `ready-notification.ts`).
import { StyleSheet, View } from 'react-native';

import type { SimpleState } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';
import { Text } from '../ui/Text';

import { analysisProgress, stepLabel } from './view-model';

const t = fr.mobile.simple.analysis;

export interface AnalysisViewProps {
  readonly state: SimpleState;
}

/** Étapes, progression et chapitres détectés. */
export function AnalysisView({ state }: AnalysisViewProps) {
  return (
    <View style={styles.base}>
      <Text variant="bodySmall" tone="secondary" testID="simple-analysis-mention">
        {t.body}
      </Text>
      <Card testID="simple-steps">
        {state.steps.map((step, index) => (
          <View
            key={step.key}
            style={[styles.step, index === 0 ? null : styles.stepBorder]}
            testID={`simple-step-${step.key}`}
          >
            <View
              style={[
                styles.bullet,
                step.state === 'done'
                  ? styles.bulletDone
                  : step.state === 'running'
                    ? styles.bulletRunning
                    : styles.bulletTodo,
              ]}
            >
              {step.state === 'done' ? (
                <Icon name="check" size={13} color={theme.colors.ink} />
              ) : null}
              {step.state === 'running' ? <View style={styles.dot} /> : null}
            </View>
            <View style={styles.stepBody}>
              <Text variant="rowTitle">{stepLabel(step.key)}</Text>
              <Text variant="caption" tone="muted">
                {step.detail ?? ''}
              </Text>
            </View>
          </View>
        ))}
        <ProgressBar
          value={analysisProgress(state)}
          label={state.title}
          testID="simple-analysis-progress"
        />
      </Card>
      <Card testID="simple-chapters-found">
        <Text variant="eyebrow" tone="muted">
          {t.chapters}
        </Text>
        {state.chaptersFound.map((chapter) => (
          <View key={chapter.position} style={styles.chapter}>
            <Text variant="caption" tone="muted" style={styles.chapterNumber}>
              {String(chapter.position).padStart(2, '0')}
            </Text>
            <Text variant="bodySmall" style={styles.chapterTitle}>
              {chapter.title}
            </Text>
          </View>
        ))}
        {state.status === 'analysing' ? (
          <Text variant="caption" tone="muted" testID="simple-analysis-reading">
            {t.reading}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.md },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  stepBorder: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  bulletDone: { backgroundColor: theme.colors.lime },
  bulletRunning: { borderWidth: 2.5, borderColor: theme.colors.indigo },
  bulletTodo: { borderWidth: 2, borderColor: theme.colors.borderStrong },
  dot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
  stepBody: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  chapterNumber: { width: 24 },
  chapterTitle: { flex: 1 },
});
