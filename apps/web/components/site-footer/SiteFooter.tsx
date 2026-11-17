import { Link } from '@learny/ui';

import { SITE_FOOTER_LINKS, SITE_FOOTER_NAV_LABEL } from '../../lib/site-footer-links';

/**
 * Common footer of the public pages (ADR-0204, SPEC-806 EF-7): one `footer`, one named navigation
 * and only the four legal entries of the registry. It loads no tracking script and sets no cookie.
 */
export function SiteFooter() {
  return (
    <footer
      className="mx-auto w-full max-w-[75rem] border-t border-solid border-border px-24 py-20"
      data-testid="site-footer"
    >
      <nav aria-label={SITE_FOOTER_NAV_LABEL}>
        <ul className="m-0 flex list-none flex-wrap gap-x-20 gap-y-8 p-0 text-14">
          {SITE_FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} variant="subtle" weight="semibold">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
