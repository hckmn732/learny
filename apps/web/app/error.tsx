'use client';

import { ErrorView } from '../components/system/error-view';

// Next passes `reset` as the second boundary prop (SPEC-308 EF-2). The retry button calls it
// exactly once; the error object itself is never rendered.
export default function ErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
