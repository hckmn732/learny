import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getMockCheckoutSession } from '@learny/services/billing';

import { MockCheckout } from '../../../../components/sdd/stripe-mock';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simulated Stripe Checkout (SPEC-210 EF-7): only with ENABLE_SDD_PAGES, never indexed.
export const metadata: Metadata = {
  title: 'Paiement simulé',
  robots: { index: false, follow: false },
};

const SESSION_PATTERN = /^cs_mock_\d{1,9}$/;

export default async function MockCheckoutPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  if (!sddPagesEnabled()) notFound();
  const { session } = await searchParams;
  const candidate = typeof session === 'string' && SESSION_PATTERN.test(session) ? session : null;
  let known = false;
  if (candidate !== null) {
    try {
      known = (await getMockCheckoutSession(candidate))?.status === 'open';
    } catch {
      // Not in simulated mode: the page has nothing to show.
      notFound();
    }
  }
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 data-testid="stripe-mock-title" className="font-display text-3xl font-semibold">
        Paiement simulé
      </h1>
      <MockCheckout sessionId={known ? candidate : null} />
    </main>
  );
}
