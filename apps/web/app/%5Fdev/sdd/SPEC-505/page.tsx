import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import Spec505Demo from '../../../../components/sdd-demos/spec-505';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Spec505DemoPage() {
  await connection();
  if (!sddPagesEnabled()) notFound();
  return (
    <DemoShell
      specId="SPEC-505"
      title="SPEC-505 · Clés personnelles"
      titleTestId="sdd-title"
      titleClassName="mt-2 font-display text-34 font-600 tracking-title"
    >
      <Spec505Demo />
    </DemoShell>
  );
}
