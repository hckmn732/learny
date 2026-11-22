// Providers of the application (SPEC-3003 EF-4; canevas § 4).
//
// `AppQueryProvider` hydrates the query cache from the encrypted MMKV store and rewrites it on
// every change, keyed by the signed-in account and by the application version (EF-4, CL-5). The
// cache is restored *before* the screens mount, so a restart without network shows the screens
// already visited (CL-4).
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
export function AppQueryProvider({ children, appVersion }: AppQueryProviderProps): ReactElement {
  const { userId } = useSession();
  const storage = useMemo(() => createAsyncStore(secureSessionStorage), []);
  const persistOptions = useMemo(
    () => createQueryPersistOptions({ storage, appVersion, userId }),
    [appVersion, storage, userId],
  );

  return (
    <PersistQueryClientProvider
      client={appQueryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // The persisted cache was read back: the demonstration page and the tests assert it (CL-4).
        markCacheRestored();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
