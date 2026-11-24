// Diagnostic global, plein écran (SPEC-4003 ET-1, EF-7, SCR-24, étape 5).
//
// Une question à la fois, aucune correction avant la fin (le serveur note à la soumission). La croix
// équivaut à « Passer » : elle abandonne la tentative et ouvre le résultat sans ligne de score.
// « Valider » enregistre le brouillon et avance ; « Je ne sais pas » avance sans réponse. Les deux
// boutons sont fixés en bas.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AnyPublicPayload } from '@learny/bricks';
import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../../src/api/registry';
import { BrickView } from '../../../../src/bricks/BrickView';
import { useAttempt } from '../../../../src/data/attempts';
import {
  useCreateDiagnostic,
  useSkipDiagnostic,
  useSubmitDiagnostic,
} from '../../../../src/simple/use-simple';
import { theme } from '../../../../src/theme';
import { Button } from '../../../../src/ui/Button';
import { Card } from '../../../../src/ui/Card';
import { Chip } from '../../../../src/ui/Chip';
import { ErrorState } from '../../../../src/ui/ErrorState';
import { IconButton } from '../../../../src/ui/IconButton';
import { ProgressBar } from '../../../../src/ui/ProgressBar';
import { Skeleton } from '../../../../src/ui/Skeleton';
import { Text } from '../../../../src/ui/Text';

const t = fr.mobile.simple.diagnostic;

export default function DiagnosticRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fid?: string; aid?: string }>();
  const fid = typeof params.fid === 'string' ? params.fid : '';
  const explicitAttempt = typeof params.aid === 'string' ? params.aid : null;
  const creator = useCreateDiagnostic(fid === '' ? null : fid);
  const skipper = useSkipDiagnostic(fid === '' ? null : fid);
  const submitter = useSubmitDiagnostic(fid === '' ? null : fid);
  const [attemptId, setAttemptId] = useState<string | null>(explicitAttempt);
  const [loadError, setLoadError] = useState<string | null>(null);
  const attempt = useAttempt(attemptId);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (attemptId !== null) return;
    let cancelled = false;
    void creator
      .create()
      .then((created) => {
        if (!cancelled) setAttemptId(created);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error !== null && typeof error === 'object' && 'code' in error
              ? String((error as { code?: unknown }).code)
              : t.failed,
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule création par tentative.
  }, [attemptId]);

  const question = attempt.data?.questions[index] ?? null;
  const total = attempt.data?.questions.length ?? 0;

  const skip = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await skipper.skip();
      router.replace({ pathname: '/formations/[fid]/resultat', params: { fid, skipped: '1' } });
    } catch {
      setBusy(false);
    }
  }, [busy, fid, router, skipper]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void skip();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [skip]);

  const goNext = async (): Promise<void> => {
    if (attemptId === null || busy) return;
    setBusy(true);
    try {
      if (response !== null && question !== null) {
        await requireApiClient().api.saveQuizAnswer({
          params: { aid: attemptId, pos: question.position },
          body: { response, timeMs: 1000 },
        });
      }
      if (index >= total - 1) {
        const result = await submitter.submit(attemptId);
        router.replace({
          pathname: '/formations/[fid]/resultat',
          params: { fid, aid: result.attemptId },
        });
        return;
      }
      setIndex((current) => current + 1);
      setResponse(null);
    } finally {
      setBusy(false);
    }
  };

  const content = (() => {
    if (loadError !== null) {
      return (
        <View style={styles.error}>
          <ErrorState
            testID="diagnostic-error"
            title={t.failed}
            onRetry={() => {
              setLoadError(null);
            }}
          />
          <Button
            label={t.skip}
            variant="outline"
            onPress={() => void skip()}
            testID="diagnostic-skip"
          />
        </View>
      );
    }
    if (attempt.status === 'loading' || attemptId === null)
      return <Skeleton animated={false} lines={5} />;
    if (attempt.status === 'error' || question === null) {
      return (
        <View style={styles.error}>
          <ErrorState testID="diagnostic-error" title={t.failed} onRetry={attempt.retry} />
          <Button
            label={t.skip}
            variant="outline"
            onPress={() => void skip()}
            testID="diagnostic-skip"
          />
        </View>
      );
    }
    return (
      <>
        <View style={styles.meta}>
          <Chip label={t.badge} tone="indigo" />
          <Text variant="caption" tone="muted" testID="diagnostic-no-correction">
            {t.noCorrection}
          </Text>
        </View>
        <View style={styles.progressRow}>
          <Text variant="label" testID="diagnostic-progress">
            {t.progress(index + 1, total)}
          </Text>
        </View>
        <ProgressBar value={(index + 1) / total} label={t.progress(index + 1, total)} />
        <Card testID="diagnostic-question">
          <Text variant="eyebrow" tone="muted">
            {question.notionLabel}
          </Text>
          <BrickView
            brick={{
              brickId: question.brickVersionId,
              versionId: question.brickVersionId,
              type: question.type,
              notionIds: [],
              publicPayload: question.payload as AnyPublicPayload,
            }}
            mode="play"
            response={response}
            onResponse={setResponse}
            disabled={busy}
            testID="diagnostic-brick"
          />
        </Card>
      </>
    );
  })();

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + theme.spacing.md },
      ]}
      testID="diagnostic-screen"
    >
      <View style={styles.head}>
        <IconButton
          name="close"
          accessibilityLabel={t.close}
          onPress={() => void skip()}
          testID="diagnostic-close"
        />
        <Chip label={t.badge} tone="indigo" />
        <Button
          label={t.skip}
          variant="outline"
          size="sm"
          onPress={() => void skip()}
          testID="diagnostic-skip"
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {content}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={t.validate}
          variant="ink"
          block
          loading={busy || submitter.pending}
          onPress={() => void goNext()}
          testID="diagnostic-validate"
        />
        <Button
          label={t.dontKnow}
          variant="outline"
          block
          disabled={busy}
          onPress={() => {
            setResponse(null);
            void goNext();
          }}
          testID="diagnostic-dontknow"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  content: { padding: theme.spacing.xl, gap: theme.spacing.md },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  progressRow: { marginTop: theme.spacing.sm },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  error: { gap: theme.spacing.md },
});
