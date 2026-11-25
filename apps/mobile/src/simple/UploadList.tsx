// Liste des documents du dépôt : file locale et sources confirmées (SPEC-4003 EF-2, CL-2).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';

import { FileRow } from './FileRow';
import { uploadPercent, type UploadTask } from './upload-queue';
import type { SourceRow } from './view-model';
import { fileMeta } from './view-model';

const t = fr.mobile.simple.deposit;

export interface UploadListProps {
  readonly tasks: readonly UploadTask[];
  readonly sources: readonly SourceRow[];
  readonly onRole: (index: number) => void;
  readonly onRemoveTask: (id: string) => void;
  readonly onRemoveSource: (id: string) => void;
  readonly onRetry: (id: string) => void;
}

function statusOf(task: UploadTask): string {
  if (task.status === 'uploaded') return t.statuses.uploaded;
  if (task.status === 'failed') return t.statuses.failed;
  if (task.status === 'uploading')
    return `${t.statuses.uploading} ${String(uploadPercent(task))} %`;
  return t.statuses.pending;
}

/** Toutes les lignes du dépôt, dans l'ordre : file puis sources du serveur. */
export function UploadList({
  tasks,
  sources,
  onRole,
  onRemoveTask,
  onRemoveSource,
  onRetry,
}: UploadListProps) {
  return (
    <View style={styles.base} testID="simple-file-list">
      {tasks.map((task, index) => (
        <FileRow
          key={task.id}
          name={task.name}
          meta={task.kind === 'link' ? task.url : fileMeta({ sizeBytes: task.sizeBytes })}
          resourceRole={task.role}
          statusLabel={statusOf(task)}
          {...(task.status === 'uploading' || task.status === 'uploaded'
            ? { progress: uploadPercent(task) }
            : {})}
          failed={task.status === 'failed'}
          onRole={() => {
            onRole(index);
          }}
          onRemove={() => {
            onRemoveTask(task.id);
          }}
          onRetry={() => {
            onRetry(task.id);
          }}
          testID={`simple-file-${String(index)}`}
          roleTestID={`simple-role-${String(index)}`}
          retryTestID={`simple-file-${String(index)}-retry`}
          removeTestID={`simple-file-${String(index)}-remove`}
        />
      ))}
      {sources.map((source, index) => (
        <FileRow
          key={source.id}
          name={source.title}
          meta={source.pages === null ? '' : fileMeta({ pages: source.pages })}
          resourceRole={source.role}
          statusLabel={source.statusLabel}
          onRole={() => {
            onRole(tasks.length + index);
          }}
          onRemove={() => {
            onRemoveSource(source.id);
          }}
          testID={`simple-source-${String(index)}`}
          roleTestID={`simple-source-role-${String(index)}`}
          removeTestID={`simple-source-${String(index)}-remove`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.sm },
});
