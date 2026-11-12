import type { Metadata } from 'next';

import { fr } from '../../../../messages/fr';

import { Demos } from './Demos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery.accessibility;

export default function AccessibilityGalleryPage() {
  return (
    <div data-testid="ui-accessibility-gallery">
      <header>
        <p className="text-14 text-ink-muted">{fr.ui.gallery.surtitle}</p>
        <h1
          className="mt-4 font-display text-34 font-semibold tracking-title"
          data-page-title
          id="titre-page"
          tabIndex={-1}
        >
          {t.title}
        </h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.intro}</p>
      </header>
      <Demos />
    </div>
  );
}
