'use client';

import { GlobalErrorView } from '../components/system/global-error-view';
import { fontVariables } from '../lib/fonts';
import './globals.css';

// Replaces the root layout when it fails: it brings its own html and body (App Router, CL-4).
export default function GlobalError({ error, reset }: { error: unknown; reset: () => void }) {
  return <GlobalErrorView className={fontVariables} error={error} reset={reset} />;
}
