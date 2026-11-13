import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import Spec510Demo from '../../../../components/sdd-demos/spec-510';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Spec510DemoPage() {
  await connection();
  if (!sddPagesEnabled()) notFound();
  return (
    <DemoShell
      specId="SPEC-510"
      title="SPEC-510 · Ingestion : pages web, YouTube et images"
      titleTestId="sdd-title"
      titleClassName="mt-2 font-display text-34 font-600 tracking-title"
    >
      <Spec510Demo />
    </DemoShell>
  );
}
