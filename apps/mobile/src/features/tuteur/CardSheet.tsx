// Confirmation sheet of a recall card (SPEC-3303 BR-AUT-06, CA-3, ADR-0193 § 4).
//
// The mobile application never creates a brick by itself: the `questions_cartes` automation drafts
// a `card_created` proposal, and this sheet asks the learner's consent before the accepted action
// creates the recall card of the next global quiz. In the `auto` mode the journal applies the
// action itself and no sheet appears.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import type { CardProposalFields } from './conversation-controller';

const t = fr.mobile.tutor;

export interface CardSheetProps {
  readonly visible: boolean;
  readonly fields: CardProposalFields | null;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Fiche de confirmation « Créer une carte ». */
export function CardSheet({ visible, fields, busy, onConfirm, onCancel }: CardSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={t.cardTitle} testID="tutor-card-sheet">
      <Text variant="bodySmall" tone="muted">
        {t.cardBody}
      </Text>
      {fields === null ? null : (
        <Card style={styles.card}>
          <Text variant="label" tone="muted">
            {t.cardQuestion}
          </Text>
          <Text variant="bodySmall" testID="tutor-card-question">
            {fields.question}
          </Text>
          <Text variant="label" tone="muted">
            {t.cardAnswer}
          </Text>
          <Text variant="bodySmall" tone="secondary" testID="tutor-card-answer">
            {fields.answer}
          </Text>
          {fields.notionLabel === '' ? null : (
            <Text variant="caption" tone="muted" testID="tutor-card-notion">
              {t.cardNotion} · {fields.notionLabel}
            </Text>
          )}
        </Card>
      )}
      <View style={styles.actions}>
        <Button
          label={t.cardCancel}
          variant="outline"
          size="sm"
          block
          onPress={onCancel}
          testID="tutor-card-cancel"
        />
        <Button
          label={t.cardConfirm}
          variant="ink"
          size="sm"
          block
          loading={busy}
          onPress={onConfirm}
          testID="tutor-card-confirm"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.xs },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
});
