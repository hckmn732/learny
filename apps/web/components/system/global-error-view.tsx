import { fr } from '../../messages/fr';

import { ErrorView } from './error-view';

/**
 * Root error shell (SPEC-308 CL-4): `global-error` replaces the root layout, so it must bring its
 * own `html` and `body`. The shell is separate from the Next font imports to stay unit-testable.
 */
export function GlobalErrorView({
  error,
  reset,
  className,
}: Readonly<{ error: unknown; reset: () => void; className?: string }>) {
  return (
    <html className={className} lang="fr">
      <body className="bg-canvas text-ink font-sans">
        <title>{fr.meta.title}</title>
        <ErrorView error={error} reset={reset} />
      </body>
    </html>
  );
}
