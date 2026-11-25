// Scaffold du chantier quickfix « rattrapage mobile » (branche quickfix/mobile-rattrapage).
//
// Chaque écran de `design/app-mobile-rattrapage/` démarre ici, puis est remplacé par son
// implémentation dans `src/features/mr/<zone>/`. Le composant disparaît quand les 13 écrans sont
// livrés. Il n'est pas un composant du design system : il ne sert qu'à rendre les routes
// navigables pendant le chantier (contrat du plan docs/engineering/quickfix-rattrapage-mobile.md).
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

export interface QuickfixPlaceholderProps {
  /** Titre de l'écran, repris de la maquette. */
  readonly screen: string;
  /** Identifiant stable pour Maestro et Jest. */
  readonly testID: string;
  /** Contexte affiché sous le titre (paramètre de route, état attendu). */
  readonly note?: string | undefined;
}

const t = fr.mr.common;

/** Coquille temporaire d'un écran du rattrapage. */
export function QuickfixPlaceholder({ screen, testID, note }: QuickfixPlaceholderProps) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View testID={testID} style={styles.base}>
        <Text variant="eyebrow" tone="muted">
          {t.eyebrow}
        </Text>
        <Text variant="title">{screen}</Text>
        <Text tone="secondary">{note ?? t.body}</Text>
        <Button
          label={t.back}
          variant="outline"
          onPress={() => {
            router.back();
          }}
          testID={`${testID}-back`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  base: {
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
});
