// Encart « Sans clé d'IA » (SPEC-4003 EF-3, BR-IA-06 ; CA-3).
//
// Same text as the web. The files stay deposited: the action leads to Profil → Modèles d'IA, and
// the back gesture returns to the deposit with the queue intact.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const t = fr.mobile.simple.key;

export interface KeyWarningProps {
  readonly onAddKey: () => void;
}

/** Encart orange du blocage sans clé. */
export function KeyWarning({ onAddKey }: KeyWarningProps) {
  return (
    <View style={styles.base} testID="simple-key-warning">
      <Icon name="key" size={20} color={theme.colors.orangeInk} />
      <View style={styles.body}>
        <Text variant="rowTitle" tone="danger" testID="simple-key-warning-title">
          {t.title}
        </Text>
        <Text variant="caption" tone="secondary">
          {t.body}
        </Text>
        <Button
          label={t.action}
          variant="ink"
          size="sm"
          icon="key"
          onPress={onAddKey}
          testID="simple-key-warning-action"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeSoft,
  },
  body: { flex: 1, minWidth: 0, gap: theme.spacing.sm },
});
