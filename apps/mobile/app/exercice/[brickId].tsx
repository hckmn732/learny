// /exercice/:brickId — Exercice pratique plein écran (maquette Exercice.dc.html, zone C).
//
// Le paramètre porte l'identifiant de l'activité d'exercice ; `fid` et `mid` sont acceptés en query
// pour le recâblage des points d'entrée. Sans eux, le contexte (formation, module) vient du créneau
// du jour de `GET /home` (arbitrage du lead, 2026-11-25). Un contexte introuvable n'est pas deviné :
// l'écran affiche « Exercice introuvable » et un retour.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { ExerciceScreen } from '../../src/features/mr/evaluation/ExerciceScreen';
import { useExerciseContext } from '../../src/features/mr/evaluation/use-activity-context';
import { useExerciseDetail } from '../../src/features/mr/evaluation/use-exercise';
import { openOnWeb } from '../../src/lib/web';
import { theme } from '../../src/theme';
import { EmptyState } from '../../src/ui/EmptyState';
import { ErrorState } from '../../src/ui/ErrorState';
import { Skeleton } from '../../src/ui/Skeleton';

const t = fr.mr.evaluation.exercice;

export default function ExerciceRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ brickId?: string; fid?: string; mid?: string }>();
  const brickId = typeof params.brickId === 'string' ? params.brickId : null;
  const explicitFid = typeof params.fid === 'string' ? params.fid : null;
  const explicitMid = typeof params.mid === 'string' ? params.mid : null;
  const context = useExerciseContext(brickId, explicitFid, explicitMid);
  const exercise = useExerciseDetail(context.formationId, context.moduleId, brickId);

  const close = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/programme');
  };

  if (context.status === 'loading' || (context.status === 'ready' && exercise.status === 'loading')) {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-exercice">
        <Skeleton animated={false} />
        <Skeleton animated={false} width="70%" />
      </View>
    );
  }

  if (context.status === 'error' || exercise.status === 'error') {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-exercice">
        <ErrorState
          title={t.errorTitle}
          description={t.errorBody}
          onRetry={() => {
            context.retry();
            exercise.retry();
          }}
          testID="qf-exercice-error-state"
        />
      </View>
    );
  }

  if (context.status === 'missing' || exercise.data === null) {
    return (
      <View style={[styles.state, { paddingTop: insets.top + theme.spacing.xl }]} testID="qf-exercice">
        <EmptyState
          icon="alert"
          title={t.contextMissingTitle}
          description={t.contextMissingBody}
          action={{
            label: t.back,
            onPress: close,
          }}
          testID="qf-exercice-missing"
        />
      </View>
    );
  }

  return (
    <ExerciceScreen
      exercise={exercise.data}
      onClose={close}
      onAskTutor={() => {
        router.push('/tuteur');
      }}
      onOpenNextStep={(href) => {
        void openOnWeb(href);
      }}
    />
  );
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