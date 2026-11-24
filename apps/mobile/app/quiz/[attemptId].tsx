// Route of the validation quiz (SPEC-3304 EF-1, EF-6, CL-3, CL-6).
//
// Full-screen route without the tabs (`app/quiz/[attemptId].tsx` is outside `(app)`), opened after
// `POST /modules/:mid/quiz/attempts` from the module screen. CL-3: an attempt already submitted —
// possibly from the web — opens its result directly instead of an empty quiz.
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import {
  useAttempt,
  useCheckAnswer,
  useSaveAnswer,
  useSubmitAttempt,
} from '../../src/data/attempts';
import { QuizScreen } from '../../src/features/quiz/QuizScreen';
import { useOnlineStatus } from '../../src/offline/network';
import { theme } from '../../src/theme';
import { EmptyState } from '../../src/ui/EmptyState';
import { ErrorState } from '../../src/ui/ErrorState';
import { Skeleton } from '../../src/ui/Skeleton';

const t = fr.mobile.quiz;

/** One attempt played full screen. */
export default function QuizRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useOnlineStatus();
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === 'string' ? params.attemptId : null;
  const attempt = useAttempt(attemptId);
  const check = useCheckAnswer(attemptId ?? '');
  const save = useSaveAnswer(attemptId ?? '');
  const submit = useSubmitAttempt(attemptId ?? '');

  if (attempt.status === 'loading') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.xl }]}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="70%" />
      </View>
    );
  }

  if (attempt.status === 'error' || attempt.data === null) {
    // CL-6 — the validation quiz is never playable offline: the message says so.
    return (
      <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.xl }]}>
        {online ? (
          <ErrorState testID="quiz-error-state" onRetry={attempt.retry} />
        ) : (
          <EmptyState icon="alert" title={t.offline} testID="quiz-offline" />
        )}
      </View>
    );
  }

  // CL-3 — already submitted (on the phone or on the web): the result is the only thing to show.
  if (attempt.data.status !== 'in_progress') {
    return <Redirect href={`/quiz/${attemptId ?? ''}/resultat`} />;
  }

  return (
    <QuizScreen
      attempt={attempt.data}
      onCheck={check.check}
      onSave={save.save}
      onFinish={async () => {
        await submit.submit();
        router.replace(`/quiz/${attemptId ?? ''}/resultat`);
      }}
      onQuit={() => {
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: theme.spacing.xl,
  },
});
