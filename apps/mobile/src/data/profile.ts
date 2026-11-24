// Profil, rythme, export et suppression (SPEC-3401 ET-1 ; BR-ACC-08, BR-ACC-10 à BR-ACC-12,
// BR-SET-02 ; canevas § 4).
//
// One read for the settings screens (`GET /me/profile`, key `['me','settings']`) and one mutation
// per intent. A save always carries the version it read (`expectedUpdatedAt`): a stale version
// answers 409, the screen reloads the server state and says so (CL-1, BR-SET-02). Export and
// deletion belong to SPEC-211: this module only transports their routes, never decides anything.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  DeletionState,
  ExportRequestOutput,
  ExportState,
  ProfilePatch,
  SettingsState,
} from '@learny/contracts';
import { isAppError } from '@learny/core';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

export type SettingsStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): SettingsStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface SettingsQuery {
  readonly status: SettingsStatus;
  readonly data: SettingsState | null;
  readonly refetch: () => void;
}

/** Profile, rhythm, pending deletion and latest export of the learner (`GET /me/profile`). */
export function useProfile(): SettingsQuery {
  const query = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => requireApiClient().api.meProfileGet({}),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Answer of a save: the new server state, or the reason of the refusal (CL-1). */
export type SaveOutcome =
  | { readonly ok: true; readonly data: SettingsState }
  | { readonly ok: false; readonly conflict: boolean; readonly error: unknown };

export interface ProfileSaver {
  /** Saves the patch; a version conflict reloads the settings first (CL-1). */
  readonly save: (patch: ProfilePatch) => Promise<SaveOutcome>;
  readonly pending: boolean;
}

/** True when the server refused the write because another client saved before us (CL-1). */
export function isVersionConflict(error: unknown): boolean {
  return isAppError(error) && (error.status === 409 || error.code === 'CONFLICT');
}

/**
 * `PATCH /me/profile` (BR-SET-02, BR-ACC-05, BR-ACC-08, BR-ACC-12): one transaction for the profile
 * and the rhythm, with the expected version. On success the answer replaces the cache; on a
 * conflict the settings are re-read so that the screen shows the version that won.
 */
export function useSaveProfile(): ProfileSaver {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: ProfilePatch) =>
      requireApiClient().api.meProfileUpdate({
        body: patch,
        // ET-3 of SPEC-3003 — the retry replays the same intention, so it cannot write twice.
      }),
  });

  return {
    save: async (patch) => {
      try {
        const data = await mutation.mutateAsync(patch);
        client.setQueryData(queryKeys.settings(), data);
        void client.invalidateQueries({ queryKey: ['me'] });
        return { ok: true, data };
      } catch (error) {
        const conflict = isVersionConflict(error);
        if (conflict) void client.invalidateQueries({ queryKey: queryKeys.settings() });
        return { ok: false, conflict, error };
      }
    },
    pending: mutation.isPending,
  };
}

export interface DeletionActions {
  /** `POST /me/deletion` — schedules the deletion at J+30 (BR-ACC-11). */
  readonly schedule: () => Promise<DeletionState>;
  /** `DELETE /me/deletion` — cancels a scheduled deletion (BR-ACC-11). */
  readonly cancel: () => Promise<void>;
  readonly pending: boolean;
}

/** Deletion request and cancellation of the account (BR-ACC-11, EF-6). */
export function useDeletion(): DeletionActions {
  const client = useQueryClient();
  const schedule = useMutation({
    mutationFn: () => requireApiClient().api.meDeletionSchedule({}),
  });
  const cancel = useMutation({
    mutationFn: () => requireApiClient().api.meDeletionCancel({}),
  });

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.settings() });
    void client.invalidateQueries({ queryKey: ['me'] });
  };

  return {
    schedule: async () => {
      const state = await schedule.mutateAsync();
      refresh();
      return state;
    },
    cancel: async () => {
      await cancel.mutateAsync();
      refresh();
    },
    pending: schedule.isPending || cancel.isPending,
  };
}

export interface ExportQuery {
  readonly status: SettingsStatus;
  readonly data: ExportState | null;
  readonly refetch: () => void;
}

/**
 * State of one export (`GET /me/exports/:id`, BR-ACC-10): the screen polls it while the archive is
 * queued or running, so the download link appears as soon as the server has it (CL-3).
 */
export function useExportState(exportId: string | null): ExportQuery {
  const query = useQuery({
    queryKey: queryKeys.exportRead(exportId ?? 'none'),
    queryFn: () => requireApiClient().api.meExportRead({ params: { id: exportId ?? '' } }),
    enabled: exportId !== null,
    retry: 1,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 2_000 : false;
    },
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface ExportRequester {
  /** Requests the archive; answers the identifier the screen then polls (BR-ACC-10). */
  readonly request: () => Promise<ExportRequestOutput>;
  readonly pending: boolean;
}

/** `POST /me/export` with one key per intention (BR-ACC-10, ET-3 of SPEC-3003). */
export function useExportRequest(): ExportRequester {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      const intent = 'export:personal-data';
      return requireApiClient()
        .api.meExportRequest({}, { idempotencyKey: idempotencyRegistry.keyFor(intent) })
        .then((output) => {
          idempotencyRegistry.resolve(intent);
          return output;
        });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.settings() });
    },
  });
  return { request: mutation.mutateAsync, pending: mutation.isPending };
}
