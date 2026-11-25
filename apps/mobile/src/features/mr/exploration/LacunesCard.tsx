// Carte d'une lacune ouverte (maquette Lacunes.dc.html ; SPEC-615 EF-2, EF-3).
//
// Une notion, son module, la nature de l'erreur et la maîtrise mesurée, puis les deux actions que
// le serveur sait cibler : la révision (`training.href`) et le passage du cours (`course.href`).
// Aucune destination n'est construite ici : les liens viennent du DTO (ET-4, ET-5).
import { StyleSheet, View } from 'react-native';

import type { GapCard as GapCardDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatDate } from '../../../lib/dates';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Text } from '../../../ui/Text';

import { Glow, Rise, Shine } from '../motion';

import { chipToneOfNature, natureLabel } from './format';

const t = fr.mr.exploration.lacunes;
const g = fr.gaps;

/** Phrase du tuteur pour une action recommandée (BR-LAC-04). */
function recommendationOf(gap: GapCardDto): string {
  switch (gap.recommendedAction) {
    case 'global_quiz':
      return g.card.recommendations.global_quiz;
    case 'confrontation':
      return g.card.recommendations.confrontation(
        gap.notionLabel,
        gap.confusedWithLabel ?? gap.moduleTitle,
      );
    case 'alternative_explanation':
      return g.card.recommendations.alternative_explanation;
    case 'practice_exercise':
      return g.card.recommendations.practice_exercise;
  }
}

export interface LacunesCardProps {
  readonly gap: GapCardDto;
  /** Zone du lecteur, pour dater la révélation de la lacune (BR-ACC-07). */
  readonly timeZone: string;
  readonly onTrain: () => void;
  /** `null` quand aucun passage du cours n'est disponible (ET-5). */
  readonly onCourse: (() => void) | null;
  /** Rang dans la liste : les cartes arrivent en cascade. */
  readonly index?: number;
}

/** Une lacune ouverte de la liste. */
export function LacunesCard({ gap, timeZone, onTrain, onCourse, index = 0 }: LacunesCardProps) {
  const revealed =
    gap.revealedBy.trim() === ''
      ? g.card.revealedFallback(formatDate(gap.detectedAt, timeZone))
      : gap.revealedBy;

  return (
    <Rise index={index} step={90}>
      <Card testID={`qf-lacunes-item-${gap.notionId}`} style={styles.card}>
        <View style={styles.topRow}>
          <Glow
            color={
              chipToneOfNature(gap.nature) === 'orange' ? theme.colors.orange : theme.colors.indigo
            }
            spread={3}
            duration={1100 + index * 150}
          >
            <Chip label={natureLabel(gap.nature)} tone={chipToneOfNature(gap.nature)} />
          </Glow>
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.module}>
            {t.moduleLine(gap.modulePosition, gap.moduleTitle)}
          </Text>
        </View>
        <Text variant="title">{gap.notionLabel}</Text>
        <Text variant="bodySmall" tone="secondary" numberOfLines={3}>
          {revealed}
        </Text>
        <View style={styles.mastery}>
          <ProgressBar
            value={gap.mastery / 100}
            label={t.masteryAnnouncement(gap.notionLabel, gap.mastery)}
          />
          <Text variant="caption" tone="muted">
            {t.masteryLine(gap.mastery, gap.threshold)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {`${g.card.tutorProposes} ${recommendationOf(gap)}`}
        </Text>
        <View style={styles.actions}>
          <Shine every={3800 + index * 400}>
            <Button
              label={g.card.train}
              onPress={onTrain}
              size="sm"
              testID={`qf-lacunes-train-${gap.notionId}`}
            />
          </Shine>
          {onCourse === null ? null : (
            <Button
              label={g.card.course}
              onPress={onCourse}
              size="sm"
              variant="outline"
              testID={`qf-lacunes-course-${gap.notionId}`}
            />
          )}
        </View>
      </Card>
    </Rise>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  module: { flexShrink: 1, textAlign: 'right' },
  mastery: { gap: theme.spacing.xs },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
});
