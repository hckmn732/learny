// Modèles d'IA du mobile (SPEC-3401 ET-1 ; BR-SET-05 ; canevas § 4).
//
// One read (`GET /me/ai/models`) and one assignment (`PATCH /me/ai/models`). The platform provides
// no model: a task without a chosen model is unavailable and the screen says why (CL-2). Adding,
// testing and deleting a provider stay on the web (ADR-3002): the mobile client only lists the
// models of the keys the learner already qualified.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { AiModelsState, AiModelsTaskId, AiModelsUpdateBody } from '@learny/contracts';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';
import type { SettingsStatus } from './profile';

export interface TaskModelsQuery {
  readonly status: SettingsStatus;
  readonly data: AiModelsState | null;
  readonly refetch: () => void;
}

/** Five tasks, their chosen model and the models each task can accept (BR-SET-05). */
export function useTaskModels(): TaskModelsQuery {
  const query = useQuery({
    queryKey: queryKeys.aiModels(),
    queryFn: () => requireApiClient().api.meAiModelsGet({}),
    retry: 1,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface TaskModelAssigner {
  /** Assigns one model to one task (`action: 'assign'`). */
  readonly assign: (task: AiModelsTaskId, modelId: string, credentialId: string) => Promise<void>;
  /** Removes the choice of one task (`action: 'clear'`). */
  readonly clear: (task: AiModelsTaskId) => Promise<void>;
  readonly pending: boolean;
}

/**
 * Assignment of a model per task (BR-SET-05): the answer already carries the whole tab state, so
 * the cache is replaced rather than invalidated — the sheet closes on fresh data.
 */
export function useAssignTaskModel(): TaskModelAssigner {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: AiModelsUpdateBody) => {
      const intent = `ai-models:${body.task}:${body.action}`;
      return requireApiClient()
        .api.meAiModelsUpdate({ body }, { idempotencyKey: idempotencyRegistry.keyFor(intent) })
        .then((state) => {
          idempotencyRegistry.resolve(intent);
          return state;
        });
    },
    onSuccess: (state) => {
      client.setQueryData(queryKeys.aiModels(), state);
    },
  });

  return {
    assign: async (task, modelId, credentialId) => {
      await mutation.mutateAsync({ action: 'assign', task, modelId, credentialId });
      // As on the web: the choice starts its compatibility check, the status then refreshes.
      void checkCompatibility(client, task, modelId, credentialId);
    },
    clear: async (task) => {
      await mutation.mutateAsync({ action: 'clear', task });
    },
    pending: mutation.isPending,
  };
}

/** Runs the compatibility probes of one task (`me.ai.credentials.qualify`) and refreshes the tab. */
async function checkCompatibility(
  client: ReturnType<typeof useQueryClient>,
  task: AiModelsTaskId,
  modelId: string,
  credentialId: string,
): Promise<void> {
  try {
    await requireApiClient().api.meAiCredentialsQualify({
      params: { id: credentialId },
      body: { modelId, task },
    });
  } catch {
    // The report keeps its status; a later visit retries.
  }
  await client.invalidateQueries({ queryKey: queryKeys.aiModels() });
}

/**
 * Tasks left « pending » (chosen before the check existed, or interrupted) are checked once per
 * visit of the screen, so the status never stays on « Vérification en cours ».
 */
export function useAutoCheckPending(state: AiModelsState | null): void {
  const client = useQueryClient();
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (state === null) return;
    for (const task of state.tasks) {
      if (task.compatibility?.status !== 'pending') continue;
      if (task.modelId === null || task.credentialId === null) continue;
      const key = `${task.credentialId}:${task.modelId}:${task.task}`;
      if (started.current.has(key)) continue;
      started.current.add(key);
      void checkCompatibility(client, task.task, task.modelId, task.credentialId);
    }
  }, [client, state]);
}

/** The model of one task, for the subtitle of the root screen (BR-SET-05). */
export function chosenModelLabel(state: AiModelsState | null): string | null {
  if (state === null) return null;
  for (const task of state.tasks) {
    if (task.available && task.providerLabel !== null) return task.providerLabel;
  }
  return null;
}
