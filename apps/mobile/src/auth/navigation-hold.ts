// Suspension of the redirect to the shell while a provider connection finishes (SPEC-3402 CA-2).
//
// `AuthGate` opens the application as soon as the session exists. A provider connection must first
// impose the acceptance of the legal documents (BR-ACC-02), so it holds the gate; the gate listens
// to this store and redirects as soon as the hold is released.
import { useSyncExternalStore } from 'react';

let held = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function holdNavigation(): void {
  if (held) return;
  held = true;
  emit();
}

export function releaseNavigation(): void {
  if (!held) return;
  held = false;
  emit();
}

export function isNavigationHeld(): boolean {
  return held;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a provider connection has not finished (CA-2). */
export function useNavigationHold(): boolean {
  return useSyncExternalStore(subscribe, isNavigationHeld, isNavigationHeld);
}
