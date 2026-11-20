import type { Metadata } from 'next';

import { MarkdownContent } from '@learny/bricks/view';
import { fr } from '@learny/i18n';

import { SiteFooter } from '../../components/site-footer/SiteFooter';
import { renderAccessibilityDeclaration } from '../../lib/accessibility-declaration';

export const metadata: Metadata = {
  title: fr.accessibility.documentTitle,
};

// SPEC-803 EF-10 — public declaration, rendered from the legal Markdown template with the
// validated legal identity. No connected shell: header, declaration card and public footer.
// Per request: a static page carries no CSP nonce and its scripts would be refused (SPEC-805).
export const dynamic = 'force-dynamic';

export default function AccessibilitePage() {
  const markdown = renderAccessibilityDeclaration({
    entityName: process.env.LEGAL_ENTITY_NAME ?? '',
    contactEmail: process.env.LEGAL_CONTACT_EMAIL ?? '',
  });

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" data-testid="accessibilite-page">
      <main id="contenu" className="mx-auto w-full max-w-[56rem] flex-1 px-24 py-40 sm:px-40">
        <header className="mb-24 flex flex-col gap-8">
          <p className="m-0 text-14 font-600 text-ink-muted">{fr.accessibility.eyebrow}</p>
          <h1 className="m-0 font-display text-34 font-600 leading-1.15 tracking-title">
            {fr.accessibility.title}
          </h1>
        </header>
        <article
          className="rounded-24 border border-solid border-border bg-surface p-24 sm:p-40"
          data-testid="accessibilite-card"
        >
          <MarkdownContent markdown={markdown.replace(/^# .*\n+/, '')} className="[&_h2]:text-20" />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
