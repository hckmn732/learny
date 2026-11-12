import type { ReactNode } from 'react';

import { cn } from '@learny/ui';

/** White gallery card of the design-system pages (SPEC-302 §10). */
export function GalleryCard({
  testId,
  title,
  intro,
  children,
  className,
}: Readonly<{
  testId: string;
  title: string;
  intro?: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        'mt-24 rounded-24 border border-solid border-border bg-surface p-24',
        className,
      )}
      data-testid={testId}
    >
      <h2 className="font-display text-18 font-600 tracking-heading">{title}</h2>
      {intro ? <p className="mt-4 text-14 text-ink-muted">{intro}</p> : null}
      <div className="mt-16">{children}</div>
    </section>
  );
}
