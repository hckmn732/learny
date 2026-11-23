// Aujourd'hui (SPEC-3102 EF-1, EF-2, EF-7, BR-NAV-01, CL-1).
//
// The root screen of the first tab carries the shell header — bell with its pastille and account
// disc — and the state of the day: a skeleton during the first read, an error with « Réessayer »,
// « Aucune formation active » when the learner owns no formation (EF-7), and the placeholder of
// the session card until SPEC-3201 delivers the real screen.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { openOnWeb } from '../../lib/web';
import { theme } from '../../theme';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';

import { AppHeader } from './AppHeader';
import { useFormations } from './use-shell';

const t = fr.mobile.shell.states;

/** True while the screen is the visible one of its tab (ET-2: no polling in the background). */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );
  return focused;
}

/** Root screen of the Aujourd'hui tab. */
export function TodayScreen() {
  const focused = useScreenFocused();
  const formations = useFormations();

  return (
    <View style={styles.base} testID="today-screen">
      <AppHeader
        title={fr.mobile.shell.tabs.today}
        actions
        active={focused}
        testID="today-header"
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {formations.status === 'loading' ? (
          <View style={styles.skeleton} testID="today-loading">
            <Skeleton animated={false} />
            <Skeleton animated={false} width="80%" />
          </View>
        ) : null}

        {formations.status === 'error' ? (
          <ErrorState testID="today-error" onRetry={formations.retry} />
        ) : null}

        {formations.status === 'ready' && formations.count === 0 ? (
          <EmptyState
            testID="today-no-formation"
            icon="layers"
            title={t.noFormationTitle}
            description={t.noFormationBody}
            action={{
              label: t.createFormation,
              onPress: () => {
                void openOnWeb('/formations/nouvelle');
              },
            }}
          />
        ) : null}

        {formations.status === 'ready' && formations.count > 0 ? (
          <EmptyState
            testID="today-placeholder"
            icon="home"
            title={t.placeholderTitle}
            description={t.placeholderBody}
          />
        ) : null}
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
  skeleton: { gap: theme.spacing.sm },
});
