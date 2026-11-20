'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setNonce } from 'get-nonce';
import { useEffect, useState, type ReactNode } from 'react';

import { ApiError } from '@learny/api-client';

/** Client rules of SPEC-201 ET-10: no retry on a 4xx, two retries otherwise; mutations never. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
      mutations: { retry: 0 },
    },
  });
}

/**
 * SPEC-805 CL-8 — a component that appends a `<style>` element must stamp it with the nonce of the
 * response, since `style-src-elem` refuses anonymous inline styles. Radix's `RemoveScroll` (behind
 * Dialog, AlertDialog, DropdownMenu and Popover) injects the scroll-lock rules through
 * `react-style-singleton`, which reads its nonce from `get-nonce`. Next does not set the legacy
 * `__webpack_nonce__` variable, so the nonce is read from the scripts Next already stamped for this
 * response (ADR-0042) and handed to the injector once, before any modal can open.
 */
function useCspNonce(): void {
  useEffect(() => {
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
    if (nonce !== '') setNonce(nonce);
  }, []);
}

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [client] = useState(createQueryClient);
  useCspNonce();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
