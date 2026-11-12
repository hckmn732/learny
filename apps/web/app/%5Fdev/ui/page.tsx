import type { Metadata } from 'next';
import Link from 'next/link';

import { fr } from '../../../messages/fr';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery;

export default function UiGalleryIndexPage() {
  return (
    <div>
      <header>
        <p className="text-14 text-ink-muted">{t.surtitle}</p>
        <h1 className="mt-4 font-display text-34 font-semibold tracking-title">{t.indexTitle}</h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.indexIntro}</p>
      </header>

      <ul className="mt-24 grid grid-cols-1 gap-16 shell:grid-cols-2">
        <li>
          <Link
            href="/_dev/ui/jetons"
            data-testid="ui-section-tokens"
            className="block rounded-24 border border-solid border-border bg-surface p-24 hover:bg-surface-subtle"
          >
            <span className="block font-display text-20 font-semibold">{t.sections.tokens}</span>
            <span className="mt-4 block text-14 text-ink-muted">{t.colors.intro}</span>
            <span className="mt-12 inline-block text-14 font-medium text-indigo-ink">
              {t.openTokens}
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/_dev/ui/actions"
            data-testid="ui-section-actions"
            className="block rounded-24 border border-solid border-border bg-surface p-24 hover:bg-surface-subtle"
          >
            <span className="block font-display text-20 font-semibold">{t.sections.actions}</span>
            <span className="mt-4 block text-14 text-ink-muted">{t.actions.intro}</span>
            <span className="mt-12 inline-block text-14 font-medium text-indigo-ink">
              {t.openActions}
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/_dev/ui/saisie"
            data-testid="ui-section-saisie"
            className="block rounded-24 border border-solid border-border bg-surface p-24 hover:bg-surface-subtle"
          >
            <span className="block font-display text-20 font-semibold">{t.sections.forms}</span>
            <span className="mt-4 block text-14 text-ink-muted">{t.saisie.intro}</span>
            <span className="mt-12 inline-block text-14 font-medium text-indigo-ink">
              {t.openSaisie}
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
