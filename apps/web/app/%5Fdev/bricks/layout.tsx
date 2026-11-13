import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SkipLink } from '@learny/ui';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function BricksLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink>Aller au contenu principal</SkipLink>
      <main
        className="learny-focus-target mx-auto max-w-[1200px] px-40 py-28"
        data-testid="main-content"
        id="contenu-principal"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
