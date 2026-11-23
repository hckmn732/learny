// Réglages de notifications du mobile (SPEC-3401 ET-1 ; BR-SET-03 ; canevas § 4).
//
// One read (`GET /me/notification-settings`) and one partial patch. The application channel is
// always on (the contract only accepts `true`), so the screen shows it locked; the browser channel
// is not displayed before SPEC-3501 (BR-SET-03). A save carries the version it read: a stale value
// answers 409 and the screen reloads the server state (CL-1 of SPEC-708, re-used here).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationSettingsDto, NotificationSettingsPatch } from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';
import { isVersionConflict, type SaveOutcome, type SettingsStatus } from './profile';

export interface NotificationSettingsQuery {
  readonly status: SettingsStatus;
  readonly data: NotificationSettingsDto | null;
  readonly refetch: () => void;
}

/** Settings of the six notification types and of the quiet hours (BR-SET-03). */
export function useNotificationSettings(): NotificationSettingsQuery {
  const query = useQuery({
    queryKey: queryKeys.notificationSettings(),
    queryFn: () => requireApiClient().api.meNotificationSettingsGet({}),
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

export interface NotificationSettingsSaver {
  readonly save: (patch: NotificationSettingsPatch) => Promise<SaveOutcomeOfSettings>;
  readonly pending: boolean;
}

export type SaveOutcomeOfSettings =
  | { readonly ok: true; readonly data: NotificationSettingsDto }
  | { readonly ok: false; readonly conflict: boolean; readonly error: unknown };

/** `PATCH /me/notification-settings` with the expected version (BR-SET-03, CL-1). */
export function useSaveNotificationSettings(): NotificationSettingsSaver {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: NotificationSettingsPatch) =>
      requireApiClient().api.meNotificationSettingsUpdate({ body: patch }),
  });

  return {
    save: async (patch) => {
      try {
        const data = await mutation.mutateAsync(patch);
        client.setQueryData(queryKeys.notificationSettings(), data);
        return { ok: true, data };
      } catch (error) {
        const conflict = isVersionConflict(error);
        if (conflict) void client.invalidateQueries({ queryKey: queryKeys.notificationSettings() });
        return { ok: false, conflict, error };
      }
    },
    pending: mutation.isPending,
  };
}

/** Counter of the mockup: « N sur 6 activés » (CA-1 of SPEC-708, BR-SET-03). */
export function typeCountOf(settings: NotificationSettingsDto | null): number {
  if (settings === null) return 0;
  return Object.values(settings.types).filter((enabled) => enabled).length;
}

/** Re-exported so that a screen imports its save outcome from one module only. */
export type { SaveOutcome };
