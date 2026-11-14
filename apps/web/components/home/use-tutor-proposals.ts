'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { AutomationActionItem } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.home.proposal;
const ACCEPTED_KEY = 'learny:tutor-proposal-accepted';

/** EF-9 — the hook reads the pending proposals and exposes the three decisions of the banner. */
export interface TutorProposals {
  action: AutomationActionItem | null;
  extraCount: number;
  accepted: AutomationActionItem | null;
  busy: boolean;
  accept(actionId: string, choice?: Record<string, unknown>): Promise<void>;
  decline(actionId: string): Promise<void>;
  undo(actionId: string): Promise<void>;
}

function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

export function useTutorProposals(): TutorProposals {
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState<AutomationActionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['automation-actions', 'reprise', 'banner'],
    queryFn: () => api.meAutomationActionsList({ query: { automation: 'reprise', limit: 20 } }),
    retry: false,
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['automation-actions'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['agenda'] }),
    ]);
  }, [queryClient]);

  const accept = useCallback(
    async (actionId: string, choice?: Record<string, unknown>) => {
      setBusy(true);
      try {
        const action = await api.meAutomationActionAccept({
          params: { id: actionId },
          body: choice === undefined ? {} : { choice },
        });
        setAccepted(action);
        window.sessionStorage.setItem(ACCEPTED_KEY, action.id);
        await invalidate();
      } finally {
        setBusy(false);
      }
    },
    [invalidate],
  );

  const decline = useCallback(
    async (actionId: string) => {
      setBusy(true);
      try {
        await api.meAutomationActionDecline({ params: { id: actionId } });
        setAccepted(null);
        window.sessionStorage.removeItem(ACCEPTED_KEY);
        await invalidate();
      } finally {
        setBusy(false);
      }
    },
    [invalidate],
  );

  const undo = useCallback(
    async (actionId: string) => {
      setBusy(true);
      try {
        await api.meAutomationActionUndo({ params: { id: actionId } });
        setAccepted(null);
        window.sessionStorage.removeItem(ACCEPTED_KEY);
        await invalidate();
      } finally {
        setBusy(false);
      }
    },
    [invalidate],
  );

  const allItems = query.data?.items ?? [];
  const storedId =
    typeof window === 'undefined' ? null : window.sessionStorage.getItem(ACCEPTED_KEY);
  const restored =
    accepted ?? allItems.find((item) => item.id === storedId && item.status === 'applied') ?? null;
  const pending = [...allItems]
    .filter((item) => item.status === 'pending_consent')
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
        left.id.localeCompare(right.id),
    );
  return {
    action: pending[0] ?? null,
    extraCount: Math.max(0, pending.length - 1),
    accepted: restored,
    busy,
    accept,
    decline,
    undo,
  };
}

export function proposalErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'CONFLICT') return t.toastConflict;
  if (code === 'AUTOMATION_ACTION_EXPIRED') return t.toastExpired;
  return t.toastError;
}
