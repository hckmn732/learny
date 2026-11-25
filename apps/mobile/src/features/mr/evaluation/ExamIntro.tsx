// Introduction de l'examen blanc (zone C, maquette ExamenBlanc.dc.html, phase 1).
//
// Règles, format officiel, diagnostic et actions : confirmer un format extrait d'un guide, lancer
// ou reprendre l'épreuve, revoir le dernier résultat. Tout vient de `exam.intro` (SPEC-614 EF-1).
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ExamIntroDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { Rise } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { IconButton } from '../../../ui/IconButton';
import { Text } from '../../../ui/Text';

const m = fr.mockExam;
const t = fr.mr.evaluation.examenBlanc;

function diagnosticRange(positions: readonly number[]): { from: number; to: number } | null {
  if (positions.length === 0) return null;
  const sorted = [...positions].sort((left, right) => left - right);
  return { from: sorted[0] ?? 0, to: sorted[sorted.length - 1] ?? 0 };
}

export interface ExamIntroProps {
  readonly intro: ExamIntroDto;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onStart: () => void;
  readonly onConfirmFormat: () => void;
  readonly onSeeResult: () => void;
}

/** Écran d'introduction de l'examen blanc. */
export function ExamIntro({
  intro,
  pending,
  error,
  onBack,
  onStart,
  onConfirmFormat,
  onSeeResult,
}: ExamIntroProps) {
  const insets = useSafeAreaInsets();
  const { format } = intro;
  const diagnostic = diagnosticRange(intro.diagnosticModules.map((module) => module.position));
  const resuming = intro.lastAttempt?.status === 'in_progress';
  const lastGraded =
    intro.lastAttempt !== null &&
    intro.lastAttempt.status !== 'in_progress' &&
    intro.lastAttempt.score !== null;

  return (
    <View style={styles.screen} testID="qf-examen-blanc-intro">
      <View style={[styles.nav, { paddingTop: insets.top + theme.spacing.lg }]}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={t.back}
          onPress={onBack}
          testID="qf-examen-blanc-back"
        />
        <Text variant="eyebrow" tone="muted">
          {m.breadcrumb}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="largeTitle">{m.title}</Text>
        <Text variant="bodySmall" tone="secondary">
          {m.subtitle(intro.title)}
        </Text>

        <View style={styles.stats}>
          <Rise index={0} style={styles.stat}>
            <Card tone="ink" style={styles.statCard} testID="qf-examen-blanc-format-questions">
              <Text variant="figure" style={styles.lime}>
                {String(format.questionCount)}
              </Text>
              <Text variant="caption" tone="onDarkSecondary">
                {m.questionsLabel}
              </Text>
            </Card>
          </Rise>
          <Rise index={1} style={styles.stat}>
            <Card style={styles.statCard} testID="qf-examen-blanc-format-duration">
              <Text variant="figure">{m.durationLabel(format.durationMin)}</Text>
              <Text variant="caption" tone="muted">
                {m.timedLabel}
              </Text>
            </Card>
          </Rise>
          <Rise index={2} style={styles.stat}>
            <Card style={styles.statCard} testID="qf-examen-blanc-format-threshold">
              <Text variant="figure">{m.thresholdLabel(format.threshold)}</Text>
              <Text variant="caption" tone="muted">
                {m.passLabel}
              </Text>
            </Card>
          </Rise>
        </View>

        <View style={styles.banner} testID="qf-examen-blanc-format-banner">
          <Text variant="bodySmall" tone="indigoInk">
            {intro.hasGuide
              ? `${m.formatGuide} ${format.confirmed ? '' : m.formatPending}`
              : m.formatDefault}
          </Text>
        </View>

        <Card testID="qf-examen-blanc-rules">
          <Text variant="sectionTitle">{m.rulesTitle}</Text>
          {m.rules.map((rule) => (
            <View key={rule} style={styles.rule}>
              <Text variant="bodySmall" tone="muted">
                •
              </Text>
              <Text variant="bodySmall" tone="secondary" style={styles.grow}>
                {rule}
              </Text>
            </View>
          ))}
        </Card>

        <Card testID="qf-examen-blanc-diagnostic">
          <Text variant="sectionTitle">{m.diagnosticTitle}</Text>
          <Text variant="bodySmall" tone="secondary">
            {diagnostic === null
              ? m.noDiagnostic
              : m.diagnosticLine(diagnostic.from, diagnostic.to, intro.diagnosticQuestionCount)}
          </Text>
          <Text variant="caption" tone="muted">
            {intro.nextExams.length === 0
              ? m.noNextExams
              : m.nextExams(intro.nextExams.map((exam) => exam.label).join(' et '))}
          </Text>
        </Card>

        {error === null ? null : (
          <Text variant="caption" tone="danger" testID="qf-examen-blanc-intro-error">
            {error}
          </Text>
        )}

        {lastGraded && intro.lastAttempt !== null ? (
          <Card testID="qf-examen-blanc-last">
            <Text variant="sectionTitle">{t.lastTitle}</Text>
            <Text variant="bodySmall" tone="secondary">
              {t.lastScore(intro.lastAttempt.score ?? 0)}
            </Text>
            <Button
              label={t.seeResult}
              variant="outline"
              onPress={onSeeResult}
              testID="qf-examen-blanc-see-result"
            />
          </Card>
        ) : null}

        <View style={styles.actions}>
          {format.confirmed ? null : (
            <Button
              label={pending ? m.confirmingFormat : m.confirmFormat}
              variant="outline"
              block
              disabled={pending}
              onPress={onConfirmFormat}
              testID="qf-examen-blanc-confirm-format"
            />
          )}
          <Button
            label={pending ? m.starting : resuming ? m.resume : m.start}
            block
            loading={pending}
            disabled={!format.confirmed || pending}
            onPress={onStart}
            testID="qf-examen-blanc-start"
          />
          {format.confirmed ? null : (
            <Text variant="caption" tone="muted" align="center">
              {m.formatPending}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxxl,
  },
  stats: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { flex: 1 },
  statCard: { flex: 1, gap: theme.spacing.xs },
  lime: { color: theme.colors.lime },
  banner: {
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.indigoSoft,
    padding: theme.spacing.md,
  },
  rule: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'flex-start' },
  grow: { flex: 1 },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});
