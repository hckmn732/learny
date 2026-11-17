import Link from 'next/link';

import { cn } from '@learny/ui';

import { SITE_FOOTER_LINKS } from '../../lib/site-footer-links';
import { fr } from '../../messages/fr';

export interface SiteFooterProps {
  className?: string;
}

/**
 * Public footer shared by authentication, legal, accessibility and offline pages (ADR-0204,
 * SPEC-803 ET-6). The registry carries the normative order; the nav is named so assistive
 * technologies can jump straight to it (3.2.3, 3.2.6).
 */
export function SiteFooter({ className }: Readonly<SiteFooterProps>) {
  return (
    <footer
      className={cn('w-full border-t border-solid border-border bg-canvas px-24 py-20', className)}
      data-testid="site-footer"
    >
      <nav aria-label={fr.siteFooter.navLabel} data-testid="site-footer-nav">
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-20 gap-y-8 p-0">
          {SITE_FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                className="text-14 text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:underline"
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
