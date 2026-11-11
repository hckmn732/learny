'use client';

import { ErrorView } from '../components/system/error-view';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
