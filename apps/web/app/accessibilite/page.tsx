import type { Metadata } from 'next';

import { Card, Link } from '@learny/ui';

import { SiteFooter } from '../../components/site-footer/SiteFooter';
import { fr } from '../../messages/fr';

const t = fr.legal.accessibility;

export const metadata: Metadata = {
  title: `${t.title} — Learny`,
  description: t.introduction,
};

/**
 * Public accessibility statement (ADR-0204, SPEC-803/SPEC-806 CL-6). SPEC-803 may enrich this page
 * and its declaration; SPEC-806 only guarantees the fourth footer link and the shared status so the
 * registry stays complete in either execution order.
 */
export default function AccessibilitePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <main
        className="mx-auto flex w-full max-w-[52rem] flex-col gap-24 px-24 py-40 sm:py-56"
        data-testid="accessibility-page"
      >
        <header className="flex flex-col gap-6">
          <p className="m-0 text-14 text-ink-muted">{t.eyebrow}</p>
          <h1 className="m-0 font-display text-34 font-600 leading-1.15 tracking-title">
            {t.title}
          </h1>
          <p className="m-0 text-15 leading-1.6 text-ink-secondary">{t.introduction}</p>
        </header>

        <Card data-testid="accessibility-status">
          <p className="m-0 text-14 text-ink-muted">{t.statusLabel}</p>
          <p className="mt-4 mb-0 font-display text-22 font-600 tracking-heading">{t.status}</p>
        </Card>

        <Card as="section">
          <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.measuresTitle}</h2>
          <ul className="mt-12 mb-0 flex list-none flex-col gap-8 p-0 text-15 leading-1.6">
            {t.measures.map((measure) => (
              <li
                className="relative pl-18 before:absolute before:top-10 before:left-0 before:size-8 before:rounded-2 before:bg-ink before:content-['']"
                key={measure}
              >
                {measure}
              </li>
            ))}
          </ul>
        </Card>

        <Card as="section">
          <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.limitsTitle}</h2>
          <p className="mt-12 mb-0 text-15 leading-1.6">{t.limits}</p>
        </Card>

        <Card as="section">
          <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.contactTitle}</h2>
          <p className="mt-12 mb-0 text-15 leading-1.6">{t.contact}</p>
          <p className="mt-12 mb-0 text-14">
            <Link href="/legal/mentions" variant="subtle" weight="semibold">
              {fr.legal.documents.mentions.title}
            </Link>
          </p>
        </Card>

        <p className="m-0 text-14">
          <Link href="/" weight="semibold">
            {t.backHome}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
