'use client';

// Every failed action of a connected screen says why in a toast (QA 2026-11-26): the API client
// reports the failed mutations, this bridge shows them, once while the same sentence is visible.
import { useEffect } from 'react';

import { apiErrorText, onApiError } from '@learny/api-client';
import { getToasts, toast } from '@learny/ui';

export function ApiErrorToasts(): null {
  useEffect(
    () =>
      onApiError((report) => {
        const title = apiErrorText(report);
        if (getToasts().some((entry) => entry.title === title)) return;
        toast({ title, tone: 'error' });
      }),
    [],
  );
  return null;
}
