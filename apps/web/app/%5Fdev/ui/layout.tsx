import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { sddPagesEnabled } from '../../../lib/sdd-pages';
import { fr } from '../../../messages/fr';

export const dynamic = 'force-dynamic';

// Development gallery: never indexed (ADR-0049, SPEC-301 EF-11).
export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery;

// Only sections whose page exists are links; future specifications append their entry here.
const SECTIONS = [
  { id: 'tokens', label: t.sections.tokens, href: '/_dev/ui/jetons' },
  { id: 'actions', label: t.sections.actions },
  { id: 'forms', label: t.sections.forms },
  { id: 'structure', label: t.sections.structure },
  { id: 'feedback', label: t.sections.feedback },
  { id: 'accessibility', label: t.sections.accessibility },
] as const;

export default function UiGalleryLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The guard runs before any token or message is rendered (SPEC-006, SPEC-301 CL-5).
  if (!sddPagesEnabled()) notFound();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex max-w-content flex-col gap-24 px-40 pt-28 pb-56 shell:flex-row shell:gap-40">
        <aside className="shrink-0 shell:w-sidebar">
          <p className="font-display text-21 font-semibold tracking-heading">Learny UI</p>
          <nav aria-label={t.navLabel} className="mt-16">
            <ul className="flex flex-wrap gap-x-8 gap-y-4 shell:flex-col shell:gap-2">
              <li>
                <Link
                  href="/_dev/ui"
                  className="inline-block rounded-8 px-8 py-3 text-14 hover:bg-surface-muted"
                >
                  {t.indexTitle}
                </Link>
              </li>
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  {'href' in section ? (
                    <Link
                      href={section.href}
                      className="inline-block rounded-8 px-8 py-3 text-14 font-medium hover:bg-surface-muted"
                    >
                      {section.label}
                    </Link>
                  ) : (
                    <span className="inline-block px-8 py-3 text-14 text-ink-muted">
                      {section.label} · {t.comingSoon}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
