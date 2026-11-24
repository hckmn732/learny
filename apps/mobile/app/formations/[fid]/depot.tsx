// Dépôt et analyse d'une formation simple (SPEC-4003 ET-1, EF-2, EF-4, EF-5 ; SCR-21, SCR-22).
//
// While the state is `collecting`, the screen shows the persisted queue and the sources the server
// already confirmed. The queue uploads at most two files, then the analysis starts. Once the state
// is `analysing`, the screen polls every two seconds and shows the four steps and the chapters.
// A missing AI key keeps the files deposited and shows the warning of EF-3.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { messageFor } from '../../../src/api/errors';
import { requireApiClient } from '../../../src/api/registry';
import { AnalysisView } from '../../../src/simple/AnalysisView';
import { FileRow } from '../../../src/simple/FileRow';
import { KeyWarning } from '../../../src/simple/KeyWarning';
import { presentReadyNotification } from '../../../src/simple/ready-notification';
import { SimpleHeader } from '../../../src/simple/SimpleHeader';
import type { UploadTask } from '../../../src/simple/upload-queue';
import {
  linkTask,
  useLaunchAnalysis,
  useSimpleQueue,
  useSimpleState,
} from '../../../src/simple/use-simple';
import { hasReadyCourse, sourceRows } from '../../../src/simple/view-model';
import { theme } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Card } from '../../../src/ui/Card';
import { ProgressBar } from '../../../src/ui/ProgressBar';
import { Sheet } from '../../../src/ui/Sheet';
import { Text } from '../../../src/ui/Text';
import { Toast } from '../../../src/ui/Toast';

const t = fr.mobile.simple.deposit;

function isAiMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'AI_NOT_CONFIGURED'
  );
}

export default function FormationDepositRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fid?: string }>();
  const fid = typeof params.fid === 'string' ? params.fid : '';
  const simple = useSimpleState(fid === '' ? null : fid, { poll: true });
  const analysis = useLaunchAnalysis(fid === '' ? null : fid);
  const [keyBlocked, setKeyBlocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [linkVisible, setLinkVisible] = useState(false);
  const [link, setLink] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const notified = useRef(false);

  const status = simple.data?.status ?? 'collecting';

  // Le worker rend le document `ready` après la finalisation : l'analyse attend qu'au moins un
  // document de cours soit prêt, sinon le serveur répond SIMPLE_NO_COURSE_SOURCE (EF-2).
  const launchWhenReady = useCallback(async (): Promise<void> => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const current = await requireApiClient().api.simpleGet({ params: { fid } });
        if (
          current.sources.some((source) => source.role === 'course' && source.status === 'ready')
        ) {
          const state = await analysis.launch();
          if (state.status === 'proposed') router.replace(`/formations/${fid}/apercu`);
          return;
        }
      } catch (error) {
        if (isAiMissing(error)) {
          setKeyBlocked(true);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setToast(fr.mobile.simple.analysis.failedTitle);
  }, [analysis, fid, router]);

  const launch = useCallback(async (): Promise<void> => {
    try {
      const state = await analysis.launch();
      if (state.status === 'proposed') router.replace(`/formations/${fid}/apercu`);
    } catch (error) {
      if (isAiMissing(error)) {
        setKeyBlocked(true);
        return;
      }
      setToast(messageFor(error));
    }
  }, [analysis, fid, router]);

  const queue = useSimpleQueue(fid === '' ? null : fid, {
    onDone: () => {
      void launchWhenReady();
    },
  });

  // Une file restaurée après une coupure reprend d'elle-même, sans renvoyer les fichiers confirmés.
  useEffect(() => {
    if (!queue.loaded || queue.busy || status !== 'collecting') return;
    if (queue.items.some((task) => task.status === 'pending' || task.status === 'failed')) {
      void queue.start();
    }
    // `queue.start` changes identity on each render; the guard is the queue content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.loaded, queue.busy, status, queue.items]);

  // Une analyse terminée ouvre l'aperçu et prévient une seule fois.
  useEffect(() => {
    if (status !== 'proposed') return;
    if (!notified.current) {
      notified.current = true;
      void presentReadyNotification(fid);
    }
    router.replace(`/formations/${fid}/apercu`);
  }, [fid, router, status]);

  // En revenant de « Modèles d'IA », l'encart disparaît et l'état est relu.
  useFocusEffect(
    useCallback(() => {
      setKeyBlocked(false);
      void simple.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fid]),
  );

  const create = async (): Promise<void> => {
    if (queue.items.some((task) => task.status === 'pending' || task.status === 'failed')) {
      await queue.start();
      return;
    }
    await launch();
  };

  const addLink = async (): Promise<void> => {
    const value = link.trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      setToast(t.linkInvalid);
      return;
    }
    if (url.protocol !== 'https:') {
      setToast(t.linkInvalid);
      return;
    }
    setAddingLink(true);
    try {
      queue.add([linkTask({ url: value, role: 'other' })]);
      await queue.start();
      setLink('');
      setLinkVisible(false);
      await simple.refetch();
    } catch (error) {
      setToast(messageFor(error));
    } finally {
      setAddingLink(false);
    }
  };

  const retryFailed = async (): Promise<void> => {
    queue.retry();
    await queue.start();
    await simple.refetch();
  };

  const canLaunch =
    status === 'collecting' &&
    (hasReadyCourse(simple.data) || queue.items.some((task) => task.role === 'course'));
  const uploading = queue.items.some((task) => task.status === 'uploading');
  const failed = queue.items.some((task) => task.status === 'failed');
  const sources = sourceRows(simple.data);

  return (
    <View style={styles.screen} testID="simple-analysis-screen">
      <SimpleHeader
        title={
          status === 'analysing' || status === 'proposed'
            ? fr.mobile.simple.analysis.title
            : t.title
        }
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/aujourdhui');
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {simple.status === 'loading' ? (
          <Card>
            <Text variant="bodySmall" tone="muted">
              {t.creating}
            </Text>
          </Card>
        ) : null}
        {simple.status === 'error' ? (
          <Card>
            <Text variant="bodySmall" tone="danger">
              {fr.mobile.simple.analysis.failedTitle}
            </Text>
            <Button
              label={fr.mobile.simple.analysis.retry}
              variant="outline"
              onPress={() => void simple.refetch()}
            />
          </Card>
        ) : null}

        {status === 'collecting' ? (
          <>
            {keyBlocked ? (
              <KeyWarning
                onAddKey={() => {
                  router.push('/profil/modeles');
                }}
              />
            ) : null}
            <Text variant="bodySmall" tone="secondary">
              {t.lede}
            </Text>
            {queue.items.length > 0 || sources.length > 0 ? (
              <View style={styles.files}>
                {queue.items.map((task, index) => (
                  <QueuedRow
                    key={task.id}
                    task={task}
                    index={index}
                    onRetry={() => void retryFailed()}
                    onRemove={() => {
                      queue.remove(task.id);
                    }}
                  />
                ))}
                {sources.map((source, index) => (
                  <FileRow
                    key={source.id}
                    name={source.title}
                    meta={source.pages === null ? '' : `${String(source.pages)} pages`}
                    resourceRole={source.role}
                    statusLabel={source.statusLabel}
                    testID={`simple-source-${String(index)}`}
                    roleTestID={`simple-source-role-${String(index)}`}
                  />
                ))}
              </View>
            ) : (
              <Card>
                <Text variant="bodySmall" tone="muted">
                  {t.noCourse}
                </Text>
              </Card>
            )}
            {uploading || failed ? (
              <Text
                variant="caption"
                tone={failed ? 'danger' : 'muted'}
                testID="simple-upload-state"
              >
                {failed ? t.uploadFailed : t.uploadHint}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLinkVisible(true);
              }}
              testID="simple-add-link"
            >
              <Text variant="caption" tone="indigo">
                {t.linkAdd}
              </Text>
            </Pressable>
          </>
        ) : null}

        {status === 'analysing' && simple.data !== null ? (
          <AnalysisView state={simple.data} />
        ) : null}

        {status === 'failed' ? (
          <Card testID="simple-analysis-error">
            <Text variant="rowTitle" tone="danger">
              {fr.mobile.simple.analysis.failedTitle}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {simple.data?.error?.message ?? ''}
            </Text>
            <Button
              label={fr.mobile.simple.analysis.retry}
              variant="outline"
              onPress={() => void launch()}
              testID="simple-analysis-retry"
            />
          </Card>
        ) : null}
      </ScrollView>

      {status === 'collecting' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {uploading ? (
            <ProgressBar value={0.5} label={t.uploadHint} testID="simple-upload-progress" />
          ) : null}
          <Button
            label={uploading ? t.creating : t.create}
            block
            loading={uploading || analysis.pending || addingLink}
            disabled={!canLaunch || keyBlocked}
            onPress={() => void create()}
            testID="simple-create"
          />
          <Text variant="caption" tone="muted" align="center">
            {t.hint}
          </Text>
        </View>
      ) : null}

      <Sheet
        visible={linkVisible}
        title={t.link}
        onClose={() => {
          setLinkVisible(false);
        }}
        testID="simple-link-sheet"
      >
        <Text variant="caption" tone="muted">
          {t.tip}
        </Text>
        <View style={styles.linkRow}>
          <TextInput
            accessibilityLabel={t.linkPlaceholder}
            placeholder={t.linkPlaceholder}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            keyboardType="url"
            style={styles.input}
            testID="simple-link"
          />
        </View>
        <Button
          label={t.linkAdd}
          loading={addingLink}
          onPress={() => void addLink()}
          testID="simple-link-add"
        />
      </Sheet>

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="simple-analysis-toast"
      />
    </View>
  );
}

function QueuedRow({
  task,
  index,
  onRetry,
  onRemove,
}: {
  readonly task: UploadTask;
  readonly index: number;
  readonly onRetry: () => void;
  readonly onRemove: () => void;
}) {
  const label =
    task.status === 'uploaded'
      ? t.statuses.uploaded
      : task.status === 'failed'
        ? t.statuses.failed
        : task.status === 'uploading'
          ? t.statuses.uploading
          : t.statuses.pending;
  const progress =
    task.status === 'uploading' && task.sizeBytes > 0
      ? Math.round((task.sentBytes / task.sizeBytes) * 100)
      : task.status === 'uploaded'
        ? 100
        : undefined;
  return (
    <FileRow
      name={task.name}
      meta={task.kind === 'link' ? task.url : undefined}
      resourceRole={task.role}
      statusLabel={label}
      {...(progress === undefined ? {} : { progress })}
      failed={task.status === 'failed'}
      onRetry={onRetry}
      onRemove={onRemove}
      testID={`simple-file-${String(index)}`}
      roleTestID={`simple-role-${String(index)}`}
      retryTestID={`simple-file-${String(index)}-retry`}
      removeTestID={`simple-file-${String(index)}-remove`}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  files: { gap: theme.spacing.sm },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.canvas,
    gap: theme.spacing.xs,
  },
  linkRow: { flexDirection: 'row', gap: theme.spacing.sm },
  input: {
    flex: 1,
    minHeight: theme.minTouchTarget.height,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
  },
});
