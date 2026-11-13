import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import Spec501Demo from '../../../../components/sdd-demos/spec-501-demo';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';
import { loadSpec501Demo } from '../spec-501-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Spec501DemoPage() {
  await connection();
  if (!sddPagesEnabled()) notFound();
  const data = await loadSpec501Demo();

  return (
    <DemoShell
      specId="SPEC-501"
      title="SPEC-501 · Briques : schémas et validation"
      titleTestId="sdd-title"
      titleClassName="mt-2 font-display text-34 font-600 tracking-title"
    >
      <Spec501Demo brick={data.brick} error={data.error} />
    </DemoShell>
  );
}
