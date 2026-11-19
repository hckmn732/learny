import { MarkdownContent } from '@learny/bricks/view';
import { legalConfigFromEnv } from '@learny/config';
import { fr } from '@learny/i18n';
import { Card, Link } from '@learny/ui';

import { LEGAL_PAGE_KEYS, loadLegalDocument, type LegalPageKey } from '../../lib/legal/documents';
import { SiteFooter } from '../site-footer/SiteFooter';

const t = fr.legal;

function labelOf(key: LegalPageKey): string {
  return t.documents[key].title;
}

function hrefOf(key: LegalPageKey): string {
  return key === 'confidentialite' ? '/legal/confidentialite' : `/legal/${key}`;
}

/**
 * Shared rendering of SCR-19 (SPEC-806 EF-1, EF-2, ET-2; SCR-19 in `tokens` mode).
 *
 * The title, version and effective date come from the versioned Markdown; the table of contents
 * precedes the content and is built from the explicit stable anchors. Placeholders stay visible and
 * are announced as information to complete, never hidden or replaced by an invented entity.
 */
export function LegalPage({ document }: Readonly<{ document: LegalPageKey }>) {
  const config = legalConfigFromEnv();
  const view = loadLegalDocument(document, { config });
  const others = LEGAL_PAGE_KEYS.filter((key) => key !== document);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <main
        className="mx-auto flex w-full max-w-[52rem] flex-col gap-24 px-24 py-40 sm:py-56"
        data-testid="legal-page"
      >
        <header className="flex flex-col gap-6">
          <p className="m-0 text-14 text-ink-muted">{t.eyebrow}</p>
          <h1
            className="m-0 font-display text-34 font-600 leading-1.15 tracking-title"
            data-testid="legal-title"
          >
            {view.title}
          </h1>
          <p className="m-0 text-14 text-ink-muted" data-testid="legal-version">
            {t.versionLabel} {view.version} · {t.effectiveLabel} {view.effectiveDate}
          </p>
        </header>

        {view.incomplete ? (
          <p
            className="m-0 rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12 text-14 leading-1.5 text-ink-secondary"
            data-testid="legal-placeholder-notice"
            role="note"
          >
            {t.placeholderNotice}
          </p>
        ) : null}

        <nav aria-labelledby="legal-toc-title" data-testid="legal-toc">
          <h2 className="m-0 font-display text-22 font-600 tracking-heading" id="legal-toc-title">
            {t.tocTitle}
          </h2>
          <ol className="mt-10 mb-0 flex list-decimal flex-col gap-6 pl-22 text-15">
            {view.sections.map((section) => (
              <li key={section.id}>
                <a
                  className="font-600 text-indigo-ink underline-offset-2 hover:underline"
                  href={`#${section.id}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-18" data-testid="legal-content">
          {view.sections.map((section) => (
            <Card as="section" key={section.id}>
              <h2
                className="m-0 scroll-mt-24 font-display text-24 font-600 leading-1.25 tracking-heading"
                id={section.id}
                tabIndex={-1}
              >
                {section.title}
              </h2>
              <div className="mt-12">
                <MarkdownContent markdown={section.markdown} />
              </div>
            </Card>
          ))}
        </div>

        <nav aria-label={t.otherDocuments} data-testid="legal-related">
          <ul className="m-0 flex list-none flex-wrap gap-x-20 gap-y-8 p-0 text-14">
            {others.map((key) => (
              <li key={key}>
                <Link href={hrefOf(key)} variant="subtle" weight="semibold">
                  {labelOf(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
