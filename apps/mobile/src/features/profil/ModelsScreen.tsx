// Modèles d'IA (SPEC-3401 EF-3, CL-2 ; BR-SET-05 ; ADR-3002).
//
// The five tasks of `docs/architecture/ai.md`, the model chosen for each one and its compatibility.
// A task accepts any model of a qualified personal key; managing a provider opens the native screen
// of the quickfix « rattrapage mobile » (/profil/cles-ia), hence the hand-off when the learner has no
// provider. Nothing is decided here: the answer of `PATCH /me/ai/models` replaces the state.
import { useRouter } from 'expo-router';
import { useState } from 'react';

import type { AiModelsTaskId, AiTaskModelState } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useAssignTaskModel, useTaskModels } from '../../data/task-models';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ErrorState } from '../../ui/ErrorState';
import { ListRow } from '../../ui/ListRow';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { SettingsScaffold, SettingsSection } from './SettingsScaffold';

const t = fr.mobile.profile.models;
const st = fr.settings.aiModels;

/** Compatibility label of one task, as the pill of the mockup shows it (BR-SET-05). */
function compatibilityLabel(task: AiTaskModelState): string {
  const status = task.compatibility?.status;
  if (status === 'compatible') return t.compatibility.compatible;
  if (status === 'reserve') return t.compatibility.reserve;
  if (status === 'pending') return t.compatibility.pending;
  return task.available ? t.compatibility.compatible : t.noChoice;
}

/** Why a task cannot run: the server reason, else the « aucun modèle choisi » of CL-3. */
function unavailableLabel(task: AiTaskModelState): string {
  const reason = task.unavailableReason;
  return reason === null ? t.noChoice : t.unavailable[reason];
}

/** Route body of `/profil/modeles`. */
export function ModelsScreen() {
  const router = useRouter();
  const models = useTaskModels();
  const assigner = useAssignTaskModel();
  const [openTask, setOpenTask] = useState<AiModelsTaskId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    router.back();
  };

  if (models.status === 'error') {
    return (
      <SettingsScaffold
        title={t.title}
        testID="models-screen"
        onBack={close}
        toast={
          <Toast
            testID="models-toast"
            visible={toast !== null}
            message={toast ?? ''}
            onHide={() => {
              setToast(null);
            }}
          />
        }
      >
        <ErrorState title={t.errorTitle} onRetry={models.refetch} testID="models-error" />
      </SettingsScaffold>
    );
  }

  if (models.data === null) {
    return (
      <SettingsScaffold title={t.title} testID="models-screen" onBack={close}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  const tasks = models.data.tasks;
  const sheetTask = tasks.find((task) => task.task === openTask) ?? null;
  const noProvider = tasks.every((task) => task.options.length === 0);

  return (
    <SettingsScaffold title={t.title} testID="models-screen" onBack={close} subtitle={t.subtitle}>
      {noProvider ? (
        <SettingsSection title={t.empty} testID="models-empty">
          <Text variant="rowSubtitle" tone="muted">
            {t.emptyBody}
          </Text>
          <Button
            label={t.manage}
            variant="outline"
            onPress={() => {
              // Quickfix « rattrapage mobile » — la gestion des clés d'IA est native (zone C). Le
              // libellé « Gérer mes fournisseurs sur le web » est conservé : il est asservi par
              // `test/profil/task-models.test.tsx`, hors du périmètre de ce recâblage.
              router.push('/profil/cles-ia');
            }}
            testID="models-manage"
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t.tasksTitle} testID="models-tasks">
        {tasks.map((task) => (
          <ListRow
            key={task.task}
            testID={`model-task-${task.task}`}
            title={st.taskLabels[task.task]}
            subtitle={
              task.modelId === null
                ? unavailableLabel(task)
                : `${task.providerLabel ?? ''} · ${compatibilityLabel(task)}`
            }
            separator={false}
            {...(task.outsideEu ? { trailing: <Chip label={t.outsideEu} tone="orange" /> } : {})}
            onPress={() => {
              setOpenTask(task.task);
            }}
          />
        ))}
      </SettingsSection>

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="models-error-message">
          {error}
        </Text>
      )}

      <Sheet
        visible={sheetTask !== null}
        onClose={() => {
          setOpenTask(null);
        }}
        title={t.sheetTitle}
        testID="models-sheet"
      >
        <Text variant="sectionTitle">
          {sheetTask === null ? '' : st.taskLabels[sheetTask.task]}
        </Text>
        {sheetTask?.options.length === 0 ? (
          <Text variant="rowSubtitle" tone="muted" testID="models-sheet-empty">
            {t.emptyBody}
          </Text>
        ) : null}
        {(sheetTask?.options ?? []).map((option, index) => (
          <ListRow
            key={`${option.credentialId}:${option.modelId}`}
            testID={`model-option-${String(index)}`}
            title={option.label}
            subtitle={option.providerLabel}
            {...(option.outsideEu ? { trailing: <Chip label={t.outsideEu} tone="orange" /> } : {})}
            onPress={() => {
              if (sheetTask === null) return;
              setError(null);
              const task = sheetTask.task;
              void assigner
                .assign(task, option.modelId, option.credentialId)
                .then(() => {
                  setToast(t.saved);
                  setOpenTask(null);
                })
                .catch((cause: unknown) => {
                  setError(messageFor(cause));
                });
            }}
          />
        ))}
        {sheetTask === null || sheetTask.modelId === null ? null : (
          <Button
            label={st.clearChoice}
            variant="text"
            onPress={() => {
              const task = sheetTask.task;
              setError(null);
              void assigner
                .clear(task)
                .then(() => {
                  setToast(st.cleared);
                  setOpenTask(null);
                })
                .catch((cause: unknown) => {
                  setError(messageFor(cause));
                });
            }}
            testID="model-clear"
          />
        )}
      </Sheet>
    </SettingsScaffold>
  );
}
