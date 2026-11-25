// Apports d'un module et import du programme (maquette Apports.dc.html, écran n° 1 de la zone A).
//
// Three deposits — files, photos, link — the list of the chapter's apports with their processing
// status, the closing action « J’ai terminé mes apports » and the dashed block that opens the
// programme import sheet. Every write goes to the routes of the web (ADR-4002); the screen only
// frames them. The whole chapter is reloaded after a write: the status of an apport belongs to
// the server, never to an optimistic guess (ADR-3002).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../api/registry';
import { radius, theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { EmptyState } from '../../../ui/EmptyState';
import { ErrorState } from '../../../ui/ErrorState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import type { IconName } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';
import { Toast } from '../../../ui/Toast';

import { ApportList } from './ApportList';
import { mrKeys, useModuleScreen } from './data';
import { ImportProgrammeSheet } from './ImportProgrammeSheet';
import { pickApportFiles, pickApportPhotos, type PickedApport } from './pickers';
import { uploadApport } from './upload';
import { isHttpsUrl, linkKindOf } from './view-model';

const t = fr.mr.programme.apports;
const m = fr.module;

interface AddTileProps {
  readonly icon: IconName;
  readonly label: string;
  readonly testID: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

/** One of the three deposit tiles of the mockup (84 pt tall, icon over its label). */
function AddTile({ icon, label, testID, onPress, disabled = false }: AddTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color={theme.colors.ink} />
      <Text variant="buttonSmall">{label}</Text>
    </Pressable>
  );
}

export interface ApportsScreenProps {
  readonly moduleId: string;
  /** Chapter opened from the route (`?chapitre=`); the server picks one when absent. */
  readonly initialChapterId?: string | null;
  readonly onBack: () => void;
}

/** Screen « Ajouter des apports ». */
export function ApportsScreen({ moduleId, initialChapterId, onBack }: ApportsScreenProps) {
  const queryClient = useQueryClient();
  const [chapterId, setChapterId] = useState<string | null>(initialChapterId ?? null);
  const screen = useModuleScreen(moduleId, chapterId);
  const data = screen.data;
  const chapters = data?.chapters ?? [];
  const selectedId = data?.selectedChapterId ?? null;
  const selected = chapters.find((chapter) => chapter.id === selectedId) ?? null;
  const done = selected?.contributionsStatus === 'done';
  const resources = data?.resources ?? [];

  const [photosOpen, setPhotosOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: mrKeys.apportsPrefix(moduleId) });
  };

  const complete = useMutation({
    mutationFn: (nextDone: boolean) =>
      requireApiClient().api.chapterComplete({
        params: { cid: selectedId ?? '' },
        body: { done: nextDone },
      }),
    onSuccess: (result, nextDone) => {
      refresh();
      setToast(result.generationRequested ? m.generationRequested : nextDone ? t.completed : t.reopened);
    },
    onError: () => {
      setToast(t.completeFailed);
    },
  });

  const addLink = useMutation({
    mutationFn: async (input: { readonly url: string; readonly title: string }) => {
      const title = input.title.trim();
      await requireApiClient().api.resourcesCreate({
        params: { cid: selectedId ?? '' },
        body: {
          kind: linkKindOf(input.url),
          url: input.url.trim(),
          ...(title === '' ? {} : { title: title.slice(0, 200) }),
        },
      });
    },
    onSuccess: () => {
      setLinkOpen(false);
      setLinkUrl('');
      setLinkTitle('');
      setLinkError(null);
      refresh();
      setToast(t.linkAdded);
    },
    onError: () => {
      setLinkError(t.uploadFailed);
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => requireApiClient().api.resourcesRetry({ params: { rid: id } }),
    onSuccess: refresh,
    onError: () => {
      setToast(t.retryFailed);
    },
  });

  const addFiles = async (files: readonly PickedApport[]): Promise<void> => {
    if (selectedId === null || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadApport(selectedId, file);
      }
      refresh();
      setToast(t.fileAdded);
    } catch {
      setToast(t.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const chooseFiles = async (): Promise<void> => {
    const outcome = await pickApportFiles();
    if (outcome.kind === 'picked') await addFiles(outcome.files);
  };

  const choosePhotos = async (source: 'camera' | 'library'): Promise<void> => {
    setPhotosOpen(false);
    const outcome = await pickApportPhotos(source);
    if (outcome.kind === 'permission') {
      setToast(t.photoPermission);
      return;
    }
    if (outcome.kind === 'picked') await addFiles(outcome.files);
  };

  const submitLink = (): void => {
    if (!isHttpsUrl(linkUrl)) {
      setLinkError(t.linkInvalid);
      return;
    }
    addLink.mutate({ url: linkUrl, title: linkTitle });
  };

  const eyebrow =
    data === null ? t.title : t.eyebrow(data.module.position, data.module.title);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="qf-apports">
      <View style={styles.nav}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={t.back}
          onPress={onBack}
          testID="qf-apports-back"
        />
        <Text variant="eyebrow" tone="muted" numberOfLines={1} style={styles.grow}>
          {eyebrow}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="heroTitle">{t.title}</Text>

        {screen.status === 'loading' ? (
          <View style={styles.loading} testID="qf-apports-loading">
            <Skeleton animated={false} lines={2} />
            <Skeleton animated={false} height={84} />
            <Skeleton animated={false} height={120} />
          </View>
        ) : null}
        {screen.status === 'error' ? (
          <ErrorState
            title={t.errorTitle}
            description={t.errorBody}
            onRetry={screen.retry}
            testID="qf-apports-error"
          />
        ) : null}

        {data === null ? null : (
          <>
            <Text variant="body" tone="secondary">
              {t.intro}
            </Text>

            <View accessibilityLabel={t.tilesLabel} style={styles.tiles} testID="qf-apports-tiles">
              <AddTile
                icon="upload"
                label={t.files}
                testID="qf-apports-files"
                disabled={uploading}
                onPress={() => {
                  void chooseFiles();
                }}
              />
              <AddTile
                icon="camera"
                label={t.photos}
                testID="qf-apports-photos"
                disabled={uploading}
                onPress={() => {
                  setPhotosOpen(true);
                }}
              />
              <AddTile
                icon="link"
                label={t.link}
                testID="qf-apports-link"
                disabled={uploading}
                onPress={() => {
                  setLinkOpen(true);
                }}
              />
            </View>
            {uploading ? (
              <Text variant="caption" tone="muted" testID="qf-apports-uploading">
                {t.uploadInProgress}
              </Text>
            ) : null}

            {chapters.length > 1 ? (
              <ScrollView
                accessibilityLabel={t.chapterPickerLabel}
                contentContainerStyle={styles.chapters}
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="qf-apports-chapters"
              >
                {chapters.map((chapter) => (
                  <Chip
                    key={chapter.id}
                    label={t.chapterLabel(chapter.position)}
                    tone={chapter.id === selectedId ? 'ink' : 'outline'}
                    onPress={() => {
                      setChapterId(chapter.id);
                    }}
                    testID={`qf-apports-chapter-${chapter.id}`}
                  />
                ))}
              </ScrollView>
            ) : null}

            <Text variant="label" tone="muted">
              {t.addedTitle(resources.length)}
            </Text>
            {resources.length === 0 ? (
              <EmptyState
                icon="upload"
                title={t.addedEmptyTitle}
                description={t.addedEmptyBody}
                action={{
                  label: t.files,
                  onPress: () => {
                    void chooseFiles();
                  },
                }}
                testID="qf-apports-empty"
              />
            ) : (
              <ApportList
                resources={resources}
                onRetry={(id) => {
                  retry.mutate(id);
                }}
              />
            )}

            <View style={styles.importCard} testID="qf-apports-import">
              <View style={styles.grow}>
                <Text variant="title">{t.importTitle}</Text>
                <Text variant="caption" tone="muted">
                  {t.importBody}
                </Text>
              </View>
              <Button
                label={t.importAction}
                variant="outline"
                size="sm"
                onPress={() => {
                  setImportOpen(true);
                }}
                testID="qf-apports-import-open"
              />
            </View>
          </>
        )}
      </ScrollView>

      {data === null ? null : (
        <View style={styles.footer}>
          <Button
            label={done ? t.reopen : t.done}
            variant={done ? 'outline' : 'primary'}
            block
            loading={complete.isPending}
            onPress={() => {
              complete.mutate(!done);
            }}
            testID="qf-apports-done"
          />
        </View>
      )}

      <Sheet
        visible={photosOpen}
        onClose={() => {
          setPhotosOpen(false);
        }}
        title={t.photosTitle}
        testID="qf-apports-photos-sheet"
      >
        <View style={styles.sheet}>
          <Button
            label={t.photosCamera}
            icon="camera"
            variant="outline"
            block
            onPress={() => {
              void choosePhotos('camera');
            }}
            testID="qf-apports-photos-camera"
          />
          <Button
            label={t.photosLibrary}
            icon="image"
            variant="outline"
            block
            onPress={() => {
              void choosePhotos('library');
            }}
            testID="qf-apports-photos-library"
          />
          <Button
            label={m.cancel}
            variant="text"
            onPress={() => {
              setPhotosOpen(false);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={linkOpen}
        onClose={() => {
          setLinkOpen(false);
        }}
        title={t.linkTitle}
        testID="qf-apports-link-sheet"
      >
        <View style={styles.sheet}>
          <Text variant="label" tone="muted">
            {t.linkAddress}
          </Text>
          <TextInput
            accessibilityLabel={t.linkAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={(value) => {
              setLinkUrl(value);
              setLinkError(null);
            }}
            placeholder={t.linkAddressPlaceholder}
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            testID="qf-apports-link-url"
            value={linkUrl}
          />
          <Text variant="label" tone="muted">
            {t.linkName}
          </Text>
          <TextInput
            accessibilityLabel={t.linkName}
            onChangeText={setLinkTitle}
            placeholder={t.linkNamePlaceholder}
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            testID="qf-apports-link-title"
            value={linkTitle}
          />
          {linkError === null ? null : (
            <Text variant="caption" tone="danger" testID="qf-apports-link-error">
              {linkError}
            </Text>
          )}
          <Button
            label={t.linkSubmit}
            block
            loading={addLink.isPending}
            onPress={submitLink}
            testID="qf-apports-link-submit"
          />
          <Button
            label={m.cancel}
            variant="text"
            onPress={() => {
              setLinkOpen(false);
            }}
          />
        </View>
      </Sheet>

      {data === null ? null : (
        <ImportProgrammeSheet
          visible={importOpen}
          formationId={data.formation.id}
          onClose={() => {
            setImportOpen(false);
          }}
          onImported={() => {
            setImportOpen(false);
            setToast(fr.mr.programme.import.success);
          }}
        />
      )}

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="qf-apports-toast"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  grow: { flex: 1, minWidth: 0 },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  loading: { gap: theme.spacing.sm },
  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chapters: { flexDirection: 'row', gap: theme.spacing.sm },
  importCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.handle,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  sheet: { gap: theme.spacing.sm },
  input: {
    minHeight: theme.controls.button.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.type.body,
  },
});