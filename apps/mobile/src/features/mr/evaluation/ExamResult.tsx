// Résultat de l'examen blanc (zone C, maquette ExamenBlanc.dc.html, phase 3).
//
// Score global, seuil, temps utilisé, score des modules étudiés et du diagnostic, modules, lacunes,
// plan du tuteur et revue filtrable des réponses. Tout vient de `exam.attempts.result` (SPEC-614),
// le client n'arrondit que l'affichage.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { ExamResultDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { Text } from '../../../ui/Text';

const m = fr.mockExam;
const t = fr.mr.evaluation.examenBlanc;

export interface ExamResultProps {
  readonly result: ExamResultDto;
  readonly onRestart: () => void;
  readonly onClose: () => void;
}

/** Résultat de l'épreuve et revue des réponses. */
export function ExamResult({ result, onRestart, onClose }: ExamResultProps) {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const rows = errorsOnly ? result.review.filter((row) => !row.isCorrect) : result.review;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="qf-examen-blanc-result"
    >
      <Text variant="eyebrow" tone="muted">
        {m.resultsTitle}
      </Text>
      <Text variant="largeTitle">{t.resultTitle}</Text>

      <Card tone="ink" testID="qf-examen-blanc-score-card">
        <View style={styles.scoreRow}>
          <View style={styles.grow}>
            <Text variant="caption" tone="onDarkSecondary">
              {t.global}
            </Text>
            <Text variant="figure" style={styles.lime} testID="qf-examen-blanc-score">
              {`${String(Math.round(result.score))} %`}
            </Text>
            <Text variant="caption" tone="onDarkSecondary">
              {t.outOf(result.score, result.threshold)}
            </Text>
          </View>
          <Chip
            label={result.passed ? m.passed(result.threshold) : m.failed(result.threshold)}
            tone={result.passed ? 'green' : 'orange'}
            testID="qf-examen-blanc-verdict"
          />
        </View>
        <Text variant="caption" tone="onDarkMuted">
          {t.time(result.timeUsedMin, result.durationMin)}
        </Text>
        {result.timedOut ? (
          <Text variant="caption" style={styles.warning}>
            {t.timedOut}
          </Text>
        ) : null}
      </Card>

      <View style={styles.rowCards}>
        <Card style={styles.stat} testID="qf-examen-blanc-studied">
          <Text variant="caption" tone="muted">
            {m.studiedLabel(1, result.modules.length)}
          </Text>
          <Text variant="title">
            {t.studied(result.studied.score, result.studied.correct, result.studied.total)}
          </Text>
          <Text variant="caption" tone="muted">
            {m.studiedNote(result.studied.score >= result.threshold)}
          </Text>
        </Card>
        <Card style={styles.stat} testID="qf-examen-blanc-diagnostic">
          <Text variant="caption" tone="muted">
            {m.diagnosticLabel(1, result.modules.length)}
          </Text>
          <Text variant="title">
            {t.diagnostic(result.diagnostic.score, result.diagnostic.correct, result.diagnostic.total)}
          </Text>
          <Text variant="caption" tone="muted">
            {m.diagnosticNote}
          </Text>
        </Card>
      </View>

      {result.modules.length === 0 ? null : (
        <Card testID="qf-examen-blanc-modules">
          <Text variant="sectionTitle">{t.modules}</Text>
          {result.modules.map((module) => (
            <View key={module.moduleId} style={styles.line}>
              <Text variant="bodySmall" style={styles.grow}>
                {m.moduleLine(module.position, module.label)}
              </Text>
              <Text variant="caption" tone={module.studied ? 'secondary' : 'muted'}>
                {`${String(Math.round(module.score))} %`}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card testID="qf-examen-blanc-gaps">
        <Text variant="sectionTitle">{t.gaps}</Text>
        {result.gaps.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {t.noGaps}
          </Text>
        ) : (
          result.gaps.map((gap) => (
            <View key={gap.notionId} style={styles.line}>
              <Text variant="bodySmall" style={styles.grow}>
                {gap.notionLabel}
              </Text>
              <Text variant="caption" tone="muted">
                {m.moduleLine(gap.modulePosition, gap.moduleLabel)}
              </Text>
            </View>
          ))
        )}
      </Card>

      {result.plan.length === 0 ? null : (
        <Card testID="qf-examen-blanc-plan">
          <Text variant="sectionTitle">{t.plan}</Text>
          {result.plan.map((step) => (
            <View key={step} style={styles.rule}>
              <Text variant="bodySmall" tone="muted">
                •
              </Text>
              <Text variant="bodySmall" tone="secondary" style={styles.grow}>
                {step}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card testID="qf-examen-blanc-review">
        <Text variant="sectionTitle">{t.reviewTitle}</Text>
        <View style={styles.filters}>
          <Chip
            label={t.filterAll}
            tone={errorsOnly ? 'outline' : 'ink'}
            onPress={() => {
              setErrorsOnly(false);
            }}
            testID="qf-examen-blanc-filter-all"
          />
          <Chip
            label={t.filterErrors}
            tone={errorsOnly ? 'ink' : 'outline'}
            onPress={() => {
              setErrorsOnly(true);
            }}
            testID="qf-examen-blanc-filter-errors"
          />
        </View>
        {rows.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {t.noReview}
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.position} style={styles.reviewRow} testID={`qf-examen-blanc-review-${String(row.position)}`}>
              <View style={styles.line}>
                <Text variant="bodySmall" style={styles.grow}>
                  {`${String(row.position)}. ${row.question}`}
                </Text>
                <Chip label={row.isCorrect ? t.correct : t.wrong} tone={row.isCorrect ? 'green' : 'orange'} />
              </View>
              <Text variant="caption" tone="secondary">
                {t.given(row.given)}
              </Text>
              {row.expected === null ? null : (
                <Text variant="caption" tone="secondary">
                  {t.expected(row.expected)}
                </Text>
              )}
              {row.explanation === null ? null : (
                <Text variant="caption" tone="muted">
                  {row.explanation}
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      <View style={styles.actions}>
        <Button label={t.restart} variant="outline" block onPress={onRestart} testID="qf-examen-blanc-restart" />
        <Button label={t.home} block onPress={onClose} testID="qf-examen-blanc-home" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  grow: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  lime: { color: theme.colors.lime },
  warning: { color: theme.colors.orange },
  rowCards: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { flex: 1, gap: theme.spacing.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  rule: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'flex-start' },
  filters: { flexDirection: 'row', gap: theme.spacing.xs },
  reviewRow: {
    gap: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});