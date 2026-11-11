import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import { findSddDemo, sddPagesEnabled } from '../../../../lib/sdd-pages';
import { sddDemos } from '../registry';

export const dynamic = 'force-dynamic';

// Demo pages are never indexed (SPEC-006, ET-3).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SddDemoPage({
  params,
}: Readonly<{ params: Promise<{ specId: string }> }>) {
  if (!sddPagesEnabled()) notFound();
  const { specId } = await params;
  // Only a validated, registered identifier reaches the registry (SPEC-006, CL-5).
  const demo = findSddDemo(specId, sddDemos);
  if (demo === undefined) notFound();

  const { default: Demo } = await demo.load();
  return (
    <DemoShell specId={specId} title={demo.title}>
      <Demo />
    </DemoShell>
  );
}
