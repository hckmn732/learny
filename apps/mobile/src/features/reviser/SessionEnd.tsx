// End screen of the session (SPEC-3305 EF-4, BR-MEM-08): notions reviewed, spaced further, due
// earlier, streak of the day and « Retour à Aujourd'hui ». Every figure comes from the server.
import { StyleSheet, View } from 'react-native';

import type { ReviewSummaryDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatShortDay, formatTime } from '../../lib/dates';
import { radius, theme } from '../../theme';
import { Button, Card, Icon, Text } from '../../ui';

const t = fr.mobile.reviser.end;

export interface SessionEndProps {
  readonly summary: ReviewSummaryDto;
  readonly timeZone: string;
  readonly onHome: () => void;
}

/** Summary screen of a completed session (EF-4). */
export function SessionEnd({ summary, timeZone, onHome }: SessionEndProps) {
  return (
    <View style={styles.wrap} accessibilityLabel={t.summaryLabel} testID="review-end">
      <Card>
        <Text variant="eyebrow" tone="success">
          {t.badge}
        </Text>
        <Text variant="sectionTitle" testID="review-end-title">
          {t.title(summary.reviewedCount, summary.minutes)}
        </Text>
        <View style={styles.figures}>
          <View style={styles.figure}>
            <View style={styles.figureLine}>
              <Icon name="check" size={16} color={theme.colors.greenInk} />
              <Text variant="figure">{String(summary.okCount)}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {t.ok}
            </Text>
          </View>
          <View style={styles.figure}>
            <View style={styles.figureLine}>
              <Icon name="flame" size={16} color={theme.colors.orange} />
              <Text variant="figure">{t.streak(summary.streakDays)}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {t.streakLabel}
            </Text>
          </View>
        </View>
        <Text variant="bodySmall" tone="secondary">
          {`${String(summary.soonCount)} ${t.soon}`}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {summary.nextSessionAt === null
            ? t.noNext
            : t.next(
                formatShortDay(summary.nextSessionAt, timeZone),
                formatTime(summary.nextSessionAt, timeZone),
              )}
        </Text>
      </Card>
      <Button label={t.home} onPress={onHome} testID="review-end-home" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.lg },
  figures: { flexDirection: 'row', gap: theme.spacing.lg, marginVertical: theme.spacing.md },
  figure: { flex: 1, gap: 2 },
  figureLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  badge: { borderRadius: radius.pill },
});
