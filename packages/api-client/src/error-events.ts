// Global report of the failed actions (QA 2026-11-26): every mutating call that fails is announced
// to the listeners the applications install (a toast on the web and on mobile), so that no
// interaction ends without telling the learner what went wrong. Reads (`GET`) are left to the
// screens, which show their own error or empty state.
import { ERROR_CATALOG, isAppError } from '@learny/core';

export interface ApiErrorReport {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly method: string;
}

type Listener = (report: ApiErrorReport) => void;

const listeners = new Set<Listener>();

/** Installs a listener of the failed actions; returns its removal. */
export function onApiError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Announces a failed call, except reads, aborts and the 401 handled by the sign-in flow. */
export function reportApiError(error: unknown, method: string): void {
  if (method.toUpperCase() === 'GET' || isAbort(error) || listeners.size === 0) return;
  const known = isAppError(error);
  const status = known ? (error.status ?? 0) : 0;
  if (status === 401) return;
  const report: ApiErrorReport = {
    code: known ? error.code : 'UNEXPECTED',
    message: known ? error.detail : '',
    status,
    method: method.toUpperCase(),
  };
  for (const listener of listeners) {
    try {
      listener(report);
    } catch {
      // A failing listener never hides the error from the caller.
    }
  }
}

const FALLBACK = 'L’action n’a pas abouti. Réessayez dans un instant.';
const NETWORK = 'Le serveur est injoignable. Vérifiez votre connexion.';

/** The sentence shown to the learner: the server detail, else the catalogue title. */
export function apiErrorText(report: ApiErrorReport): string {
  if (report.message.trim() !== '') return report.message;
  if (report.code === 'NETWORK_ERROR') return NETWORK;
  const entry = (ERROR_CATALOG as Record<string, { title: string } | undefined>)[report.code];
  return entry?.title ?? FALLBACK;
}
