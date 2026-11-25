// /aujourdhui/examen-blanc/:activityId — Examen blanc (maquette ExamenBlanc.dc.html, zone C).
//
// Le paramètre porte l'identifiant de l'activité d'examen ; `fid` est accepté en query pour le
// recâblage. Sans lui, la formation vient du créneau du jour de `GET /home` (arbitrage du lead,
// 2026-11-25) ; un contexte introuvable affiche « Examen introuvable » et un retour.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { ExamenBlancScreen } from '../../../../src/features/mr/evaluation/ExamenBlancScreen';
import { useFormationContext } from '../../../../src/features/mr/evaluation/use-activity-context';
import { theme } from '../../../../src/theme';
import { EmptyState } from '../../../../src/ui/EmptyState';
import { ErrorState } from '../../../../src/ui/ErrorState';
import { Skeleton } from '../../../../src/ui/Skeleton';

const t = fr.mr.evaluation.examenBlanc;

export default function ExamenBlancRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ activityId?: string; fid?: string }>();
  const activityId = typeof params.activityId === 'string' ? params.activityId : null;
  const explicitFid = typeof params.fid === 'string' ? params.fid : null;
  const context = useFormationContext(activityId, explicitFid);

  const close = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/aujourdhui');
  };

  if (context.status === 'loading') {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-examen-blanc">
        <Skeleton animated={false} />
        <Skeleton animated={false} width="70%" />
      </View>
    );
  }

  if (context.status === 'error') {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-examen-blanc">
        <ErrorState
          title={t.introError}
          onRetry={context.retry}
          testID="qf-examen-blanc-context-error"
        />
      </View>
    );
  }

  if (context.formationId === null) {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-examen-blanc">
        <EmptyState
          icon="alert"
          title={t.contextMissingTitle}
          description={t.contextMissingBody}
          action={{ label: t.back, onPress: close }}
          testID="qf-examen-blanc-missing"
        />
      </View>
    );
  }

  return <ExamenBlancScreen formationId={context.formationId} onClose={close} />;
}

const styles = StyleSheet.create({
  state: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
});