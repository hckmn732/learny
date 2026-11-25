// Moule commun des écrans d'exploration (zone D du rattrapage mobile) : lacunes, carte, recherche.
//
// Un écran de la pile dessine son propre en-tête (le `TabStack` cache le sien) : chevron de retour,
// sur-titre, grand titre, puis un corps défilant. Les écrans qui ont besoin d'un pied ou d'une
// action d'en-tête les passent ici, pour que la géométrie reste la même d'un écran à l'autre.
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { IconButton } from '../../../ui/IconButton';
import { Text } from '../../../ui/Text';

const t = fr.mr.exploration.common;

export interface ExplorationScaffoldProps {
  /** Grand titre de l'écran, repris de la maquette. */
  readonly title: string;
  /** Sur-titre : la zone du web dont l'écran reprend le contenu. */
  readonly eyebrow: string;
  /** Identifiant stable du test (Maestro, Jest) ; les commandes en dérivent leur suffixe. */
  readonly testID: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  readonly subtitle?: string | undefined;
  /** Action alignée à droite du titre (un filtre, un mode). */
  readonly headerRight?: ReactNode;
  /** Pied fixe, hors du défilement. */
  readonly footer?: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: (() => void) | undefined;
}

/** Corps d'un écran empilé de l'exploration. */
export function ExplorationScaffold({
  title,
  eyebrow,
  testID,
  onBack,
  children,
  subtitle,
  headerRight,
  footer,
  refreshing = false,
  onRefresh,
}: ExplorationScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen} testID={testID}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={styles.titleRow}>
          <IconButton
            name="chevronLeft"
            accessibilityLabel={t.back}
            onPress={onBack}
            testID={`${testID}-back`}
          />
          {headerRight === undefined ? null : headerRight}
        </View>
        <Text variant="eyebrow" tone="muted">
          {eyebrow}
        </Text>
        <Text variant="largeTitle" testID={`${testID}-title`}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="bodySmall" tone="secondary" testID={`${testID}-subtitle`}>
            {subtitle}
          </Text>
        )}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...(onRefresh === undefined
          ? {}
          : {
              refreshControl: (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.colors.inkMuted}
                />
              ),
            })}
        testID={`${testID}-scroll`}
      >
        {children}
      </ScrollView>
      {footer === undefined ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {footer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  header: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: -theme.spacing.sm,
  },
  scroll: { flex: 1 },
  content: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.huge,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xs,
  },
  footer: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
});
