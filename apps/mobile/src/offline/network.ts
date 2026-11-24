// Network state of the application (SPEC-3003 EF-5, CL-4).
//
// One source of truth: `onlineManager` of TanStack Query, fed by `@react-native-community/netinfo`
// (`src/offline/network-wiring.ts`). TanStack pauses the queries while offline and replays them
// when the network returns, and the bandeau reads the same flag: no second state to keep in sync.
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** True when the connection is lost: the bandeau and the cached screens are shown (EF-5). */
export function isOffline(online: boolean): boolean {
  return !online;
}

function subscribe(listener: () => void): () => void {
  return onlineManager.subscribe(listener);
}

function snapshot(): boolean {
  return onlineManager.isOnline();
}

/** Online state, reactive (EF-5). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Current online state, outside React. */
export function isOnline(): boolean {
  return onlineManager.isOnline();
}

/**
 * Forces the online state. Used by the demonstration page of the SDD builds to render the offline
 * band without an airplane mode (Maestro 2.12.1 cannot toggle the radio; the real NetInfo path is
 * covered by the Jest tests and by `network-wiring.ts`).
 */
export function setOnlineForDemo(online: boolean): void {
  onlineManager.setOnline(online);
}
