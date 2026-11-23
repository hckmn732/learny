// Root screen of a tab that is not delivered yet (SPEC-3102 EF-2).
//
// The five tabs exist from SPEC-3102 on; their content arrives with SPEC-3201 (Aujourd'hui),
// SPEC-3202 (Programme), SPEC-3203 (Réviser), SPEC-3305 (Agenda) and SPEC-3401 (Profil). Until
// then the root screen says it in one sentence, with the header of the shell.
import { StyleSheet, ScrollView, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { EmptyState } from '../../ui/EmptyState';
import type { IconName } from '../../ui/icons';

import { AppHeader } from './AppHeader';

export interface PlaceholderTabScreenProps {
  readonly title: string;
  readonly icon?: IconName;
  readonly testID: string;
  /** Shows the bell and the account disc (Aujourd'hui, BR-NAV-01). */
  readonly actions?: boolean;
}

const t = fr.mobile.shell.states;

/** Screen of a tab whose content is delivered by a later specification. */
export function PlaceholderTabScreen({
  title,
  icon = 'layers',
  testID,
  actions = false,
}: PlaceholderTabScreenProps) {
  return (
    <View style={styles.base} testID={testID}>
      <AppHeader title={title} actions={actions} testID={`${testID}-header`} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <EmptyState
          icon={icon}
          title={t.placeholderTitle}
          description={t.placeholderBody}
          testID={`${testID}-placeholder`}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
  content: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
});
