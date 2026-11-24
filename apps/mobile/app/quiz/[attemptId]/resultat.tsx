// Route of the result of a validation attempt (SPEC-3304 EF-7, CA-3, CL-5, CL-6).
//
// The screen reads `GET /attempts/:aid/result` and refreshes it every five seconds while an open
// answer waits for the tutor (ET-1). The actions stay on the allowed perimeter (ADR-3002): the next
// module opens inside the application, the remediation opens the web, and a new attempt starts from
// the current module when the server allows it.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAttemptResult } from '../../../src/data/attempts';
import { useMe } from '../../../src/data/use-programme';
import { ResultScreen } from '../../../src/features/quiz/ResultScreen';
import { useStartQuiz } from '../../../src/features/quiz/use-start-quiz';
import { userTimeZone } from '../../../src/lib/dates';
import { openOnWeb } from '../../../src/lib/web';
import { theme } from '../../../src/theme';
import { ErrorState } from '../../../src/ui/ErrorState';
import { Skeleton } from '../../../src/ui/Skeleton';

/** Result of one attempt, with the actions of BR-QUI-05 and BR-QUI-06. */
export default function ResultRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === 'string' ? params.attemptId : null;
  const result = useAttemptResult(attemptId);
  const me = useMe();
  const starter = useStartQuiz();
  const timeZone = userTimeZone(me.data);

  if (result.status === 'loading') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.xl }]}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="70%" />
      </View>
    );
  }

  if (result.status === 'error' || result.data === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.xl }]}>
        <ErrorState testID="result-error" onRetry={result.retry} />
      </View>
    );
  }

  const data = result.data;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ResultScreen
        result={data}
        timeZone={timeZone}
        onNextModule={() => {
          if (data.nextModule === null) return;
          router.replace({
            pathname: '/(app)/programme/module/[moduleId]',
            params: { moduleId: data.nextModule.id },
          });
        }}
        onRemediation={() => {
          const href = data.remediation.href;
          if (href === null) return;
          void openOnWeb(href);
        }}
        onRetry={() => {
          void starter.start(data.module.id).then((outcome) => {
            if (!outcome.ok) return;
            router.replace(`/quiz/${outcome.attemptId}`);
          });
        }}
        retryBusy={starter.pending}
        onHome={() => {
          router.dismissAll();
          router.replace('/(app)/aujourdhui');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
});
