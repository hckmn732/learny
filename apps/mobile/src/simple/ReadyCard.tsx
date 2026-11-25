// Carte noire « Ton premier chapitre est prêt » (SPEC-4003 EF-8, SCR-24, étape 6).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const t = fr.mobile.simple.result;

export interface ReadyCardProps {
  readonly modulePosition: number;
  readonly moduleTitle: string;
  readonly chapterTitle: string;
  readonly minutes: number | null;
  readonly exercises: number | null;
  readonly pages: string | null;
  readonly onStart: () => void;
  readonly onProgramme?: () => void;
}

/** Carte de démarrage du premier chapitre. */
export function ReadyCard({
  modulePosition,
  moduleTitle,
  chapterTitle,
  minutes,
  exercises,
  pages,
  onStart,
  onProgramme,
}: ReadyCardProps) {
  return (
    <View style={styles.card} testID="simple-ready-card">
      <Text variant="eyebrow" tone="limeInk">
        {t.readyEyebrow}
      </Text>
      <Text variant="sectionTitle" tone="inverse">
        {chapterTitle}
      </Text>
      <Text variant="bodySmall" tone="onDarkSecondary">
        {t.chapter(modulePosition, moduleTitle)}
      </Text>
      <View style={styles.chips}>
        <Chip
          label={minutes === null ? 'Cours' : `Cours · ${String(minutes)} min`}
          tone="outline"
        />
        {exercises === null ? null : (
          <Chip label={`${String(exercises)} exercices`} tone="outline" />
        )}
        {pages === null ? null : <Chip label={pages} tone="outline" icon="book" />}
      </View>
      <View style={styles.actions}>
        <Button
          label={minutes === null ? t.startChapter(25) : t.startChapter(minutes)}
          variant="primary"
          block
          onPress={onStart}
          testID="simple-ready-start"
        />
        {onProgramme === undefined ? null : (
          <Button
            label={t.seeProgramme}
            variant="outline"
            block
            onPress={onProgramme}
            testID="simple-ready-programme"
          />
        )}
      </View>
      <View style={styles.footnote}>
        <Icon name="book" size={13} color={theme.colors.onDarkMuted} />
        <Text variant="caption" tone="onDarkMuted" style={styles.footnoteText}>
          {t.footnote}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  footnote: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  footnoteText: { flex: 1 },
});
