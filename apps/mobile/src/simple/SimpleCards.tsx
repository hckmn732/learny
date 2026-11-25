// Les deux cartes de « Nouvelle formation » sur Aujourd'hui (SPEC-4003 EF-1, SCR-03).
//
// La carte citron est la porte d'entrée du mode simple ; la carte blanche garde le cadrage avec
// le tuteur, encore renvoyé au web tant que le parcours mobile n'est pas rattrapé (ADR-4002 § 3).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Text } from '../ui/Text';

const t = fr.mobile.simple.cards;

export interface SimpleCardsProps {
  readonly onDrop: () => void;
  readonly onTutor: () => void;
}

/** Section « Nouvelle formation » de l'écran Aujourd'hui. */
export function SimpleCards({ onDrop, onTutor }: SimpleCardsProps) {
  return (
    <View style={styles.section} testID="simple-cards">
      <Text variant="eyebrow" tone="muted" style={styles.sectionTitle}>
        {fr.mobile.simple.section}
      </Text>
      <Card tone="surface" style={[styles.card, styles.dropCard]} testID="simple-card-drop">
        <View style={styles.badgeRow}>
          <Chip label={t.dropBadge} tone="ink" />
          <Text variant="caption" tone="limeInk">
            {t.dropReady}
          </Text>
        </View>
        <Text variant="sectionTitle" style={styles.title}>
          {t.dropTitle}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {t.dropBody}
        </Text>
        <View style={styles.footer}>
          <Button
            label={t.dropAction}
            variant="ink"
            size="sm"
            icon="upload"
            onPress={onDrop}
            testID="simple-card-drop-action"
          />
        </View>
      </Card>
      <Card tone="surface" style={styles.card} testID="simple-card-tutor">
        <Chip label={t.tutorBadge} tone="indigo" />
        <Text variant="sectionTitle" style={styles.title}>
          {t.tutorTitle}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {t.tutorBody}
        </Text>
        <View style={styles.footer}>
          <Text variant="caption" tone="muted">
            {t.tutorMeta}
          </Text>
          <Button
            label={t.tutorAction}
            variant="outline"
            size="sm"
            onPress={onTutor}
            testID="simple-card-tutor-action"
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.md },
  sectionTitle: { marginBottom: 0 },
  // QA 2026-11-25: compact cards so the home screen fits without scrolling.
  card: { gap: theme.spacing.xs },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dropCard: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  title: { marginTop: theme.spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
});
