// Providers of the application (SPEC-3003 EF-4, CL-4; canevas § 4).
//
// `AppQueryProvider` hydrates the query cache from the encrypted MMKV store and rewrites it on
// every change, keyed by the signed-in account and by the application version (EF-4, CL-5).
//
// The cache is mounted **after** the session is restored: the persister discriminator carries the
// account (`version:userId`, § 15), so restoring before the session is known would look for the
// cache of « anonymous » and drop the real one. The splash screen is still up during that
// millisecond-scale wait, hence the `null` render.
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { type ReactElement, type ReactNode, useMemo } from 'react';

import { secureSessionStorage } from '../auth/secure-backend';
import { useSession } from '../auth/session';

import { createAsyncStore, createQueryPersistOptions, markCacheRestored } from './persist';
import { appQueryClient } from './query-client';

export interface AppQueryProviderProps {
  readonly children: ReactNode;
  /** Application version of the cache discriminator (CL-5); `Constants.expoConfig.version`. */
  readonly appVersion: string;
}

/** Query cache provider of the application (EF-4). */
export function AppQueryProvider({ children, appVersion }: AppQueryProviderProps): ReactElement | null {
  const { userId, status } = useSession();
  const storage = useMemo(() => createAsyncStore(secureSessionStorage), []);
  const persistOptions = useMemo(
    () => createQueryPersistOptions({ storage, appVersion, userId }),
    [appVersion, storage, userId],
  );

  // CL-4 — the cache can only be keyed by account once the session is known.
  if (status === 'loading') return null;

  return (
    <PersistQueryClientProvider
      client={appQueryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Number of queries actually read back from the encrypted store (CL-4, `sdd-cache-status`).
        markCacheRestored(appQueryClient.getQueryCache().getAll().length);
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
