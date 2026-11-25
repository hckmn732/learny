// Feuille « Vous avez déjà un programme ? » (maquette Apports, bloc import).
//
// Deux entrées pour la route `POST /formations/:fid/programme/import` : un fichier (PDF, Word,
// TXT, Markdown) lu en base64, ou un programme collé. Le serveur refuse l'import d'une formation
// déjà active (`PROGRAMME_ALREADY_ACTIVE`, 409) : la feuille lit donc l'état du programme et
// explique ce refus au lieu de le provoquer.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { isActiveProgramme } from '@learny/contracts';
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../api/registry';
import { uuidV4 } from '../../../api/uuid';
import { queryKeys } from '../../../data/keys';
import { useProgramme } from '../../../data/use-programme';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { ErrorState } from '../../../ui/ErrorState';
import { Sheet } from '../../../ui/Sheet';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';

const t = fr.mr.programme.import;

/** API bound of the imported file (`ImportProgrammeInput`): 700 kB at most. */
const MAX_BYTES = 700 * 1024;

const PROGRAMME_TYPES: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

interface PickedProgramme {
  readonly uri: string;
  readonly name: string;
  readonly sizeBytes: number;
}

function errorTextOf(cause: unknown): string {
  if (isAppError(cause)) {
    const known: Record<string, string | undefined> = fr.programme.errors;
    const text = known[cause.code];
    if (text !== undefined) return text;
    if (cause.detail !== '') return cause.detail;
  }
  return t.error;
}

async function readBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export interface ImportProgrammeSheetProps {
  readonly visible: boolean;
  readonly formationId: string;
  readonly onClose: () => void;
  /** Called once the server accepted the import. */
  readonly onImported: () => void;
}

/** Sheet that imports a programme as a new proposal. */
export function ImportProgrammeSheet({
  visible,
  formationId,
  onClose,
  onImported,
}: ImportProgrammeSheetProps) {
  const queryClient = useQueryClient();
  const programme = useProgramme(visible ? formationId : null);
  const [file, setFile] = useState<PickedProgramme | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = programme.data !== null && isActiveProgramme(programme.data);
  const version =
    programme.data !== null && !isActiveProgramme(programme.data)
      ? (programme.data.proposal?.version ?? 0)
      : 0;

  const submit = useMutation({
    mutationFn: async () => {
      const api = requireApiClient().api;
      const idempotencyKey = uuidV4();
      if (file !== null) {
        const contentBase64 = await readBase64(file.uri);
        await api.programmeImport(
          {
            params: { fid: formationId },
            body: {
              kind: 'file',
              filename: file.name,
              contentBase64,
              expectedVersion: version,
            },
          },
          { idempotencyKey },
        );
        return;
      }
      await api.programmeImport(
        {
          params: { fid: formationId },
          body: { kind: 'text', text: text.trim(), expectedVersion: version },
        },
        { idempotencyKey },
      );
    },
    onSuccess: () => {
      setFile(null);
      setText('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.programme(formationId) });
      onImported();
    },
    onError: (cause) => {
      setError(errorTextOf(cause));
    },
  });

  const pick = async (): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...PROGRAMME_TYPES],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    const sizeBytes = asset.size ?? 0;
    setFile({ uri: asset.uri, name: asset.name, sizeBytes });
    setError(sizeBytes > MAX_BYTES ? t.tooLarge : null);
  };

  const empty = file === null && text.trim() === '';

  const body = (): ReactNode => {
    if (programme.status === 'loading') {
      return (
        <View style={styles.skeleton}>
          <Skeleton animated={false} lines={2} />
          <Skeleton animated={false} width="60%" />
        </View>
      );
    }
    if (programme.status === 'error') {
      return <ErrorState testID="qf-import-error" onRetry={programme.retry} />;
    }
    if (active) {
      return (
        <View style={styles.block}>
          <Text variant="title">{t.activeTitle}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t.activeBody}
          </Text>
          <Button label={t.close} variant="outline" onPress={onClose} testID="qf-import-close" />
        </View>
      );
    }
    return (
      <View style={styles.block}>
        <Text variant="bodySmall" tone="secondary">
          {t.hint}
        </Text>
        <Button
          label={file === null ? t.pick : file.name}
          icon="upload"
          variant="outline"
          onPress={() => {
            void pick();
          }}
          testID="qf-import-pick"
        />
        <Text variant="label" tone="muted">
          {t.pasted}
        </Text>
        <TextInput
          accessibilityLabel={t.placeholder}
          multiline
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          placeholder={t.placeholder}
          placeholderTextColor={theme.colors.inkMuted}
          style={styles.input}
          testID="qf-import-text"
          value={text}
        />
        {error === null ? null : (
          <Text variant="caption" tone="danger" testID="qf-import-message">
            {error}
          </Text>
        )}
        <Button
          label={submit.isPending ? t.submitting : t.submit}
          loading={submit.isPending}
          disabled={empty}
          block
          onPress={() => {
            if (empty) {
              setError(t.empty);
              return;
            }
            submit.mutate();
          }}
          testID="qf-import-submit"
        />
        <Button label={t.cancel} variant="text" onPress={onClose} testID="qf-import-cancel" />
      </View>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t.title} testID="qf-import-programme">
      {body()}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing.md },
  skeleton: { gap: theme.spacing.sm },
  input: {
    minHeight: theme.controls.button.md * 2,
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