// Confirmation of the exit of the validation quiz (SPEC-3304 EF-5, CA-4; BR-QUI-02).
//
// The sheet is the only way out of the quiz: closing the route or the Android back gesture asks the
// same question (« Quitter le quiz ? Vos réponses sont enregistrées, vous pourrez reprendre. »).
// Nothing is written here — every answer is already saved as a draft — so leaving loses nothing.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

const t = fr.mobile.quiz;

export interface QuitConfirmSheetProps {
  readonly visible: boolean;
  readonly onQuit: () => void;
  readonly onCancel: () => void;
}

/** « Quitter le quiz ? » with the two actions of EF-5. */
export function QuitConfirmSheet({ visible, onQuit, onCancel }: QuitConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={t.quitTitle} testID="quiz-quit-sheet">
      <View style={styles.body}>
        <Text variant="body" tone="secondary" testID="quiz-quit-body">
          {t.quitBody}
        </Text>
        <Button label={t.quit} variant="ink" block onPress={onQuit} testID="quiz-quit-confirm" />
        <Button
          label={t.cancel}
          variant="outline"
          block
          onPress={onCancel}
          testID="quiz-quit-cancel"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
});
