import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { SAP_FORMATION } from '@learny/learning-engine/fixtures';

import Spec401Demo from '../../../../components/sdd-demos/spec-401';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Spec401DemoPage() {
  await connection();
  if (!sddPagesEnabled()) notFound();

  return (
    <main data-testid="sdd-demo" className="mx-auto max-w-4xl p-8">
      <p className="text-14 text-ink-muted">Socle du moteur</p>
      <h1 data-testid="sdd-title" className="mt-2 font-display text-34 font-600 tracking-title">
        SPEC-401 · Socle du moteur
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {`${SAP_FORMATION.title} · du ${SAP_FORMATION.startDate} au ${SAP_FORMATION.endDate} · ${SAP_FORMATION.tz}`}
      </p>
      <Spec401Demo />
    </main>
  );
}
