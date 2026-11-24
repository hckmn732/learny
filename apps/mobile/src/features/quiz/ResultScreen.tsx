// Result of a validation attempt (SPEC-3304 EF-7, CA-3, CA-5; BR-QUI-05, BR-QUI-06, BR-QUI-08).
//
// Everything displayed comes from `GET /attempts/:aid/result` (ET-3): the score, the threshold and
// the passed/failed verdict are the server's, never a local computation. The screen shows the score
// as the mockup does (a big ring), the per-notion bars, the gaps with their nature, the attempt
// history and the actions of section 4 of the specification:
//   - passed: « Ouvrir le module suivant » (BR-QUI-05);
//   - failed: « Commencer la remédiation », which opens the web (ADR-3002), and the date of the next
//     attempt, disabled while `RETRY_NOT_YET_ALLOWED` (BR-QUI-06, CL-5);
//   - an open answer still waiting for the tutor shows « Correction du tuteur en cours » (CL-6).
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { QuizResultDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatDateTime } from '../../lib/dates';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ProgressBar } from '../../ui/ProgressBar';
import { Text } from '../../ui/Text';

const t = fr.mobile.quiz.result;

/** Geometry of the result screen, outside the theme because it belongs to this screen only. */
const SIZES = { ring: 200, ringBorder: 12, history: 96 } as const;

export interface ResultScreenProps {
  readonly result: QuizResultDto;
  /** Zone of the learner, from `/me` (BR-ACC-07). */
  readonly timeZone: string;
  readonly onNextModule: () => void;
  readonly onRemediation: () => void;
  readonly onRetry: () => void;
  readonly onHome: () => void;
  readonly retryBusy?: boolean;
  readonly retryError?: string | null;
}

/** Result of one attempt, with its per-notion bars, gaps, history and actions. */
export function ResultScreen({
  result,
  timeZone,
  onNextModule,
  onRemediation,
  onRetry,
  onHome,
  retryBusy = false,
  retryError = null,
}: ResultScreenProps) {
  const pending = result.pendingOpenCount > 0;
  const passed = result.passed === true;
  const score = result.score ?? result.provisionalScore;
  const rounded = score === null ? null : Math.round(score);
  const retryAt = useMemo(
    () =>
      result.retry.availableAt === null ? null : formatDateTime(result.retry.availableAt, timeZone),
    [result.retry.availableAt, timeZone],
  );
  const canRetry = result.retry.allowed && !retryBusy;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="result-screen"
    >
      <Text variant="eyebrow" tone="muted" testID="result-kicker">
        {t.kicker(result.attemptNo, result.module.title)}
      </Text>
      <Text variant="largeTitle" testID="result-title">
        {t.title}
      </Text>

      <View style={styles.ringRow}>
        <View
          accessibilityLabel={rounded === null ? t.title : `${String(rounded)} %`}
          accessibilityRole="text"
          style={[styles.ring, passed ? styles.ringPassed : styles.ringFailed]}
          testID="result-score"
        >
          <Text variant="largeTitle" testID="result-score-value">
            {rounded === null ? '—' : `${String(rounded)} %`}
          </Text>
        </View>
      </View>
      <Text variant="body" tone="secondary" align="center" testID="result-threshold">
        {t.threshold(result.threshold)}
      </Text>

      <View
        style={[styles.verdict, passed ? styles.verdictPassed : styles.verdictFailed]}
        testID="result-verdict"
      >
        <Text
          variant="sectionTitle"
          tone={passed ? 'success' : 'danger'}
          testID="result-verdict-label"
        >
          {passed ? t.passed : t.failed}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {passed ? t.passedBody : t.failedBody}
        </Text>
        {!passed && result.pointsMissing !== null ? (
          <Text variant="caption" tone="muted" testID="result-points-missing">
            {t.pointsMissing(result.pointsMissing)}
          </Text>
        ) : null}
      </View>

      {pending ? (
        <Card testID="result-pending">
          <Text variant="sectionTitle">{t.provisional}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t.provisionalBody}
          </Text>
        </Card>
      ) : null}

      {result.perNotion.length === 0 ? null : (
        <Card testID="result-notions">
          <Text variant="sectionTitle">{t.perNotion}</Text>
          <View style={styles.bars}>
            {result.perNotion.map((notion) => (
              <View
                key={notion.notionId}
                style={styles.barRow}
                testID={`result-notion-${notion.notionId}`}
              >
                <View style={styles.barHead}>
                  <Text variant="bodySmall" style={styles.grow}>
                    {notion.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {`${String(Math.round(notion.score))} %`}
                  </Text>
                </View>
                <ProgressBar
                  value={Math.max(0, Math.min(1, notion.score / 100))}
                  label={notion.label}
                />
              </View>
            ))}
          </View>
        </Card>
      )}

      {result.gaps.length === 0 ? null : (
        <Card testID="result-gaps">
          <Text variant="sectionTitle">{t.gaps}</Text>
          {result.gaps.map((gap) => (
            <View key={gap.notionId} style={styles.gap} testID={`result-gap-${gap.notionId}`}>
              <View style={styles.barHead}>
                <Text variant="bodySmall" style={styles.grow}>
                  {gap.label}
                </Text>
                <Text variant="caption" tone="danger">
                  {gap.natureLabel}
                </Text>
              </View>
              <Text variant="caption" tone="secondary">
                {gap.evidence}
              </Text>
              <Text variant="caption" tone="muted">
                {gap.proposal}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {result.mastered.length === 0 ? null : (
        <Card testID="result-mastered">
          <Text variant="sectionTitle">{t.mastered}</Text>
          <View style={styles.chips}>
            {result.mastered.map((notion) => (
              <View
                key={notion.notionId}
                style={styles.chip}
                testID={`result-mastered-${notion.notionId}`}
              >
                <Text variant="caption">{notion.label}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {result.history.length === 0 ? null : (
        <Card testID="result-history">
          <Text variant="sectionTitle">{t.history}</Text>
          <View style={styles.history}>
            {result.history.map((entry) => (
              <View
                key={entry.attemptNo}
                style={styles.historyColumn}
                testID={`result-history-${String(entry.attemptNo)}`}
              >
                <View style={styles.historyTrack}>
                  <View
                    style={[
                      styles.historyBar,
                      entry.passed ? styles.historyPassed : styles.historyFailed,
                      { height: `${String(Math.max(4, Math.round(entry.score)))}%` },
                    ]}
                  />
                </View>
                <Text variant="caption" tone="muted">
                  {String(entry.attemptNo)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        {passed && result.nextModule !== null ? (
          <Button
            label={t.nextModule}
            variant="ink"
            block
            onPress={onNextModule}
            testID="result-next-module"
          />
        ) : null}

        {passed ? null : (
          <>
            <Text variant="caption" tone="muted" testID="result-remediation-web">
              {t.remediationWeb}
            </Text>
            <Button
              label={t.remediation}
              variant="ink"
              block
              onPress={onRemediation}
              testID="result-remediation"
            />
            <Button
              label={retryAt === null ? t.retry : t.retryAvailable(retryAt)}
              variant="outline"
              block
              disabled={!canRetry}
              loading={retryBusy}
              onPress={onRetry}
              testID="result-retry"
            />
          </>
        )}

        {retryError === null ? null : (
          <Text variant="caption" tone="danger" testID="result-retry-error">
            {retryError}
          </Text>
        )}

        <Button label={t.home} variant="outline" block onPress={onHome} testID="result-home" />
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
  ringRow: { alignItems: 'center', paddingVertical: theme.spacing.md },
  ring: {
    width: SIZES.ring,
    height: SIZES.ring,
    borderRadius: SIZES.ring / 2,
    borderWidth: SIZES.ringBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  ringPassed: { borderColor: theme.colors.lime },
  ringFailed: { borderColor: theme.colors.orange },
  verdict: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
  },
  verdictPassed: { backgroundColor: theme.colors.greenSoft },
  verdictFailed: { backgroundColor: theme.colors.orangeSoft },
  bars: { gap: theme.spacing.md, marginTop: theme.spacing.sm },
  barRow: { gap: theme.spacing.xs },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  grow: { flex: 1 },
  gap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  chip: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  history: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    height: SIZES.history,
    marginTop: theme.spacing.sm,
  },
  historyColumn: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  historyTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  historyBar: { width: '100%', borderRadius: theme.radius.control, minHeight: 4 },
  historyPassed: { backgroundColor: theme.colors.lime },
  historyFailed: { backgroundColor: theme.colors.orange },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
});
