// Wiring of the network and of the application state to TanStack Query (SPEC-3003 EF-4, EF-5).
//
// - NetInfo reports the connection to `onlineManager`: a lost connection pauses the queries, the
//   return of the network replays them and invalidates the active ones (canevas § 4);
// - `AppState` invalidates the active queries when the application comes back to the foreground,
//   which is the canvas rule ("rafraîchissement au retour au premier plan").
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/** Maps a NetInfo state to the online flag of the application (EF-5). */
export function isReachable(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export interface OfflineWiring {
  /** Stops both subscriptions (tests, unmount of the root layout). */
  stop(): void;
}

/**
 * Subscribes the application to the network and to the foreground state (EF-4, EF-5).
 * Idempotent per call site: `app/_layout.tsx` starts it once and stops it on unmount.
 */
export function startOfflineWiring(queryClient: QueryClient): OfflineWiring {
  const stopNetwork = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(isReachable(state));
  });

  const stopOnline = onlineManager.subscribe((online) => {
    if (online) void queryClient.invalidateQueries();
  });

  const appState = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status === 'active' && onlineManager.isOnline()) {
      void queryClient.invalidateQueries({ refetchType: 'active' });
    }
  });

  return {
    stop() {
      stopNetwork();
      stopOnline();
      appState.remove();
    },
  };
}
