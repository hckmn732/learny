// Warm-up of the day (SPEC-3305 EF-5, BR-AUT-03; route `reviser/echauffement/[activityId]`).
//
// The warm-up comes from `GET /warmups/today`; each first-pass answer is sent to the idempotent
// route and the server returns the updated activity, which advances the screen. Offline the
// warm-up needs the network: its questions are not part of the offline pack.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { useWarmupAnswer, useWarmupToday } from '../../../../src/data/warmup';
import { WarmupView } from '../../../../src/features/reviser/WarmupView';
import { useOnlineStatus } from '../../../../src/offline/network';
import { theme } from '../../../../src/theme';
import { EmptyState, ErrorState, Skeleton } from '../../../../src/ui';

const t = fr.mobile.reviser.warmup;

export default function WarmupRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ activityId?: string }>();
  const online = useOnlineStatus();
  const warmups = useWarmupToday();
  const answer = useWarmupAnswer();
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activityId = params.activityId ?? '';
  const warmup =
    warmups.data?.items.find((item) => item.activityId === activityId) ??
    warmups.data?.items[0] ??
    null;

  if (warmups.status === 'error' && warmup === null) {
    return (
      <View style={styles.state}>
        <ErrorState
          title={t.loadError}
          onRetry={() => {
            void warmups.refetch();
          }}
        />
      </View>
    );
  }

  if (warmup === null) {
    return (
      <View style={styles.state}>
        {warmups.status === 'loading' ? (
          <Skeleton testID="warmup-loading" />
        ) : (
          <EmptyState icon="flame" title={t.empty} testID="warmup-empty" />
        )}
      </View>
    );
  }

  const answered = new Set(warmup.answers.map((entry) => entry.position));
  const position =
    warmup.items.find((item) => !answered.has(item.position))?.position ??
    warmup.items[warmup.items.length - 1]?.position ??
    0;

  return (
    <WarmupView
      warmup={warmup}
      position={position}
      revealed={revealed}
      pending={answer.isPending}
      online={online}
      error={error}
      onReveal={() => {
        setRevealed(true);
      }}
      onAnswer={(knew) => {
        setError(null);
        answer.mutate(
          { activityId: warmup.activityId, position, knew },
          {
            onSuccess: () => {
              setRevealed(false);
            },
            onError: () => {
              setError(t.answerError);
            },
          },
        );
      }}
      onClose={() => {
        router.replace('/reviser');
      }}
    />
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, justifyContent: 'center', backgroundColor: theme.colors.canvas },
});
