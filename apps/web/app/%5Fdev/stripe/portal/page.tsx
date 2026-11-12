import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isSafeRelativePath } from '@learny/contracts';

import { MockPortal } from '../../../../components/sdd/stripe-mock';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

// Simulated Stripe customer portal (SPEC-210 EF-7): only with ENABLE_SDD_PAGES, never indexed.
export const metadata: Metadata = {
  title: 'Portail simulé',
  robots: { index: false, follow: false },
};

export default async function MockPortalPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  if (!sddPagesEnabled()) notFound();
  const { return: back } = await searchParams;
  const returnPath = typeof back === 'string' && isSafeRelativePath(back) ? back : '/parametres#ia';
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 data-testid="stripe-mock-title" className="font-display text-3xl font-semibold">
        Portail client simulé
      </h1>
      <MockPortal returnPath={returnPath} />
    </main>
  );
}
