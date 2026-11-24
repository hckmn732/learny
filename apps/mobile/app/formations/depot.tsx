// Route du dépôt sans formation (SPEC-4003 ET-1, EF-2, SCR-21).
//
// The learner picks documents, photos or a link locally; « Créer ma formation » creates the
// formation once, writes the persisted queue and hands over to `[fid]/depot`, which uploads and
// starts the analysis. A share received before sign-in is already in the store and is added here.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { messageFor } from '../../src/api/errors';
import { FileRow } from '../../src/simple/FileRow';
import { pickDocuments, pickPagePhotos } from '../../src/simple/pickers';
import { readPendingShare, clearPendingShare } from '../../src/simple/share-intake';
import { SimpleHeader } from '../../src/simple/SimpleHeader';
import type { UploadTask } from '../../src/simple/upload-queue';
import {
  fileTask,
  linkTask,
  saveQueue,
  useCreateSimpleFormation,
} from '../../src/simple/use-simple';
import { roleLabel, ROLE_ORDER } from '../../src/simple/view-model';
import { theme } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Sheet } from '../../src/ui/Sheet';
import { Text } from '../../src/ui/Text';
import { Toast } from '../../src/ui/Toast';

const t = fr.mobile.simple.deposit;

const MAX_SOURCES = 10;

export default function DepositRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const creator = useCreateSimpleFormation();
  const [tasks, setTasks] = useState<readonly UploadTask[]>([]);
  const [motivation, setMotivation] = useState('');
  const [link, setLink] = useState('');
  const [linkVisible, setLinkVisible] = useState(false);
  const [photosVisible, setPhotosVisible] = useState(false);
  const [roleIndex, setRoleIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = (message: string): void => {
    setToast(message);
  };

  const append = (incoming: readonly UploadTask[]): void => {
    setTasks((current) => {
      const room = Math.max(0, MAX_SOURCES - current.length);
      if (incoming.length > room) notify(t.tooMany);
      return [...current, ...incoming.slice(0, room)];
    });
  };

  useEffect(() => {
    let cancelled = false;
    void readPendingShare().then((shared) => {
      if (cancelled || shared === null) return;
      append([
        fileTask({
          uri: shared.uri,
          name: shared.name,
          mime: shared.mime,
          sizeBytes: shared.sizeBytes,
          role: 'course',
        }),
      ]);
      void clearPendingShare();
      notify(t.sharedAdded);
    });
    return () => {
      cancelled = true;
    };
    // `append` is stable enough: it only closes over the setter and the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (source: 'files' | 'camera' | 'library'): Promise<void> => {
    try {
      const outcome = source === 'files' ? await pickDocuments() : await pickPagePhotos(source);
      if (outcome.kind === 'picked') append(outcome.tasks);
      else if (outcome.kind === 'permission') {
        Alert.alert(t.permissionTitle, t.permissionBody, [
          { text: 'Annuler', style: 'cancel' },
          { text: t.openSettings, onPress: () => void Linking.openSettings() },
        ]);
      }
    } catch {
      notify(t.pickFailed);
    }
  };

  const addLink = (): void => {
    const value = link.trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      notify(t.linkInvalid);
      return;
    }
    if (url.protocol !== 'https:') {
      notify(t.linkInvalid);
      return;
    }
    if (tasks.some((task) => task.kind === 'link' && task.url === value)) {
      notify(t.linkDuplicate);
      return;
    }
    append([linkTask({ url: value, role: 'other' })]);
    setLink('');
    setLinkVisible(false);
  };

  const courseCount = tasks.filter((task) => task.role === 'course').length;
  const canCreate = courseCount > 0 && !busy && !creator.pending;

  const create = async (): Promise<void> => {
    if (!canCreate) {
      notify(t.noCourse);
      return;
    }
    setBusy(true);
    try {
      const state = await creator.create(
        motivation.trim() === '' ? {} : { motivation: motivation.trim() },
      );
      await saveQueue(state.formationId, tasks);
      router.replace(`/formations/${state.formationId}/depot`);
    } catch (error) {
      notify(messageFor(error));
      setBusy(false);
    }
  };

  const role = roleIndex === null ? null : (tasks[roleIndex] ?? null);

  return (
    <View style={styles.screen} testID="simple-deposit-screen">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SimpleHeader
          title={t.title}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/aujourdhui');
          }}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="bodySmall" tone="secondary">
            {t.lede}
          </Text>
          <View style={styles.pickerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.files}
              onPress={() => void pick('files')}
              style={styles.picker}
              testID="simple-dropzone"
            >
              <Icon name="upload" size={22} color={theme.colors.ink} />
              <Text variant="caption">{t.files}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.photos}
              onPress={() => {
                setPhotosVisible(true);
              }}
              style={styles.picker}
              testID="simple-pick-photos"
            >
              <Icon name="camera" size={22} color={theme.colors.ink} />
              <Text variant="caption">{t.photos}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.link}
              onPress={() => {
                setLinkVisible((visible) => !visible);
              }}
              style={styles.picker}
              testID="simple-pick-link"
            >
              <Icon name="link" size={22} color={theme.colors.ink} />
              <Text variant="caption">{t.link}</Text>
            </Pressable>
          </View>

          {linkVisible ? (
            <View style={styles.linkRow}>
              <TextInput
                accessibilityLabel={t.linkPlaceholder}
                placeholder={t.linkPlaceholder}
                placeholderTextColor={theme.colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={link}
                onChangeText={setLink}
                style={styles.input}
                testID="simple-link"
              />
              <Button
                label={t.linkAdd}
                variant="outline"
                size="sm"
                onPress={addLink}
                testID="simple-link-add"
              />
            </View>
          ) : null}

          {tasks.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="bodySmall" tone="muted" align="center">
                {t.tip}
              </Text>
            </View>
          ) : (
            <View style={styles.files}>
              {tasks.map((task, index) => (
                <FileRow
                  key={task.id}
                  name={task.name}
                  meta={
                    task.kind === 'link'
                      ? task.url
                      : task.sizeBytes > 0
                        ? `${String(task.sizeBytes)} o`
                        : ''
                  }
                  resourceRole={task.role}
                  statusLabel={t.statuses.pending}
                  onRole={() => {
                    setRoleIndex(index);
                  }}
                  onRemove={() => {
                    setTasks((current) => current.filter((entry) => entry.id !== task.id));
                  }}
                  testID={`simple-file-${String(index)}`}
                  roleTestID={`simple-role-${String(index)}`}
                  removeTestID={`simple-file-${String(index)}-remove`}
                />
              ))}
            </View>
          )}

          <View style={styles.motivation}>
            <Text variant="rowTitle">{`${t.motivationLabel} ${t.motivationOptional}`}</Text>
            <TextInput
              accessibilityLabel={t.motivationLabel}
              placeholder={t.motivationPlaceholder}
              placeholderTextColor={theme.colors.inkMuted}
              multiline
              maxLength={300}
              value={motivation}
              onChangeText={setMotivation}
              style={[styles.input, styles.textarea]}
              testID="simple-motivation"
            />
          </View>

          <Text variant="caption" tone="muted">
            {t.tip}
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Button
            label={busy || creator.pending ? t.creating : t.create}
            block
            loading={busy || creator.pending}
            disabled={courseCount === 0}
            onPress={() => void create()}
            testID="simple-create"
          />
          <Text variant="caption" tone="muted" align="center">
            {t.hint}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={photosVisible}
        title={t.photos}
        onClose={() => {
          setPhotosVisible(false);
        }}
        testID="simple-photos-sheet"
      >
        <Button
          label={t.photos}
          icon="camera"
          onPress={() => {
            setPhotosVisible(false);
            void pick('camera');
          }}
          testID="simple-photos-camera"
        />
        <Button
          label={t.files}
          variant="outline"
          icon="image"
          onPress={() => {
            setPhotosVisible(false);
            void pick('library');
          }}
          testID="simple-photos-library"
        />
        <Text variant="caption" tone="muted">
          {t.tip}
        </Text>
      </Sheet>

      <Sheet
        visible={role !== null}
        title={t.roleTitle}
        onClose={() => {
          setRoleIndex(null);
        }}
        testID="simple-role-sheet"
      >
        <Text variant="caption" tone="muted">
          {t.roleBody}
        </Text>
        {ROLE_ORDER.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: role?.role === option }}
            onPress={() => {
              if (roleIndex === null) return;
              setTasks((current) =>
                current.map((task, index) =>
                  index === roleIndex ? { ...task, role: option } : task,
                ),
              );
              setRoleIndex(null);
            }}
            style={[styles.roleOption, role?.role === option ? styles.roleSelected : null]}
            testID={`simple-role-option-${option}`}
          >
            <Text variant="body">{roleLabel(option)}</Text>
            {role?.role === option ? (
              <Icon name="check" size={16} color={theme.colors.indigo} />
            ) : null}
          </Pressable>
        ))}
      </Sheet>

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="simple-deposit-toast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  pickerRow: { flexDirection: 'row', gap: theme.spacing.sm },
  picker: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  input: {
    flex: 1,
    minHeight: theme.minTouchTarget.height,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
    fontFamily: theme.fontFamilies.body,
    fontSize: 14,
  },
  textarea: { minHeight: 74, paddingTop: theme.spacing.md, textAlignVertical: 'top' },
  empty: {
    padding: theme.spacing.xl,
    borderRadius: theme.radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.handle,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  files: { gap: theme.spacing.sm },
  motivation: { gap: theme.spacing.xs },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.canvas,
    gap: theme.spacing.xs,
  },
  roleOption: {
    minHeight: theme.minTouchTarget.height,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.control,
  },
  roleSelected: { backgroundColor: theme.colors.surfaceSubtle },
});
